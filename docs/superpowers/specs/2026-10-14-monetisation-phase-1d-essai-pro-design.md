# Monétisation phase 1D — Essai Pro de 14 jours

Date : 2026-10-14. Suite de 1A (droits des plans), 1B (boosts), 1C (leads). Dernier morceau après celui-ci : 1E stats par niveau + export.

## Objectif

Un agent qui n'a jamais été abonné peut essayer le plan Pro Agent pendant 14 jours, d'un clic, sans paiement. À la fin de l'essai il retombe sur le plan gratuit (annonces et alertes en trop masquées, jamais supprimées) s'il n'a pas souscrit.

## Décisions (validées)

- **Déclenchement** : bouton « Essayer Pro 14 jours » (réglages, carte d'abonnement), **une seule fois par compte**, sans carte ni paiement. Pas d'essai automatique, pas d'octroi par l'admin.
- **Contenu** : les droits du plan Pro Agent (30 annonces actives, 10 alertes secteur, fonctions du plan) pendant 14 jours. **Aucun jeton mensuel ni boost inclus** : ils ne sont accordés qu'au paiement.
- **Éligibilité** : compte `OWNER_AGENT`, jamais abonné (aucune ligne d'abonnement, ou ligne `FREE` / `ACTIVE` sans essai déjà pris). Un agent dont l'abonnement payant a expiré n'est pas éligible, ni un agent qui a déjà fait un essai.
- **Pas de période de grâce** après un essai : il s'arrête net à la date de fin.
- **Souscrire pendant l'essai** : le paiement démarre une période normale de 30 jours à partir du paiement (le reste de l'essai n'est pas ajouté) et accorde les jetons et boosts du plan, comme pour tout paiement.
- **Durée** : 14 jours, constante dans le code (pas de réglage admin).
- Rappel : notification à J-3 de la fin de l'essai ; notification à la fin.

## État actuel (vérifié dans le code)

- `Subscription` : `planKey`, `status` (`ACTIVE | GRACE | EXPIRED | CANCELED`), `currentPeriodEnd`, `canceledAt`, `boostCredits`. Aucun champ d'essai.
- `getEffectivePlanKey` dérive le plan effectif à partir de la ligne et de l'horloge ; `ACTIVE`/`GRACE` bénéficient de 7 jours de grâce après `currentPeriodEnd`.
- Cron horaire `runSubscriptionLifecycle` : rappels J-7/J-3, `ACTIVE`→`GRACE`, `GRACE`/`CANCELED`→`EXPIRED` avec masquage des annonces et désactivation des alertes en trop.
- `grantSubscription` (webhook de paiement) n'étend une période que pour `ACTIVE`/`CANCELED` du même plan ; tout autre état repart de « maintenant ». Un nouveau statut `TRIAL` est donc traité comme un démarrage à zéro, sans modification de cette règle.

## Design

### 1. Données (migration Prisma)

`Subscription.trialStartedAt DateTime?` : date de prise de l'essai, conservée après sa fin (c'est la trace « essai déjà utilisé »). Nouveau statut `TRIAL` (commentaire du champ `status` mis à jour). Aucun nouvel index.

### 2. Plan effectif

`getEffectivePlanKey` : `status = 'TRIAL'` → le plan de la ligne jusqu'à `currentPeriodEnd` inclus, `FREE` ensuite, **sans** grâce. Le plan effectif reste correct même si le cron a du retard.

### 3. API

- `POST /api/subscriptions/trial` — `runtime = 'nodejs'`, `verifyCsrf` puis `requireAuth`. Compte non agent : 403 `AGENT_ONLY`. Non éligible : 409 `TRIAL_NOT_AVAILABLE`. Sinon, dans une transaction avec le verrou de quotas d'annonces de l'utilisateur : relecture de l'éligibilité sous verrou, `upsert` de la ligne (`planKey = 'PRO_AGENT'`, `status = 'TRIAL'`, `currentPeriodEnd = now + 14 j`, `trialStartedAt = now`, `canceledAt = null`), réactivation des annonces masquées dans le quota Pro (comme `grantSubscription`). Réponse 201 `{ subscription }`. Aucun jeton, aucun boost.
- `GET /api/subscriptions/me` : expose `trialStartedAt` et `trialEligible` (booléen calculé côté serveur avec la même règle).
- `POST /api/subscriptions/cancel` et `change-plan` : un essai ne peut pas être « annulé » (il se termine seul) ; passer à FREE depuis l'essai reste possible via `change-plan` (la ligne redevient `FREE`/`ACTIVE` et `trialStartedAt` est conservé). Souscrire à un plan payant passe par le paiement habituel.

### 4. Cycle de vie (cron horaire)

- Rappel : lignes `TRIAL` finissant dans moins de 3 jours → notification dédupliquée « Votre essai Pro se termine dans N jours ».
- Fin : lignes `TRIAL` avec `currentPeriodEnd <= now` → `updateMany` gardé (`planKey = 'FREE'`, `status = 'EXPIRED'`) dans une transaction avec verrou annonces puis alertes, masquage des annonces en trop (`hideExcessListings`), désactivation des alertes en trop (`disableExcessAlerts`), notification de fin. Idempotent : un second passage ne change rien.
- `LifecycleResult` gagne `trialEnded`.

### 5. Interface

- Carte d'abonnement : pour un agent éligible sur le plan gratuit, bloc « Essayez Pro gratuitement pendant 14 jours — 30 annonces, 10 alertes » avec le bouton « Démarrer l'essai ». Pendant l'essai : badge « Essai Pro », date de fin et jours restants, et bouton « Passer à Pro » vers le paiement existant. Après l'essai : plus de bloc.
- Erreurs : `TRIAL_NOT_AVAILABLE` affiché en toast.

## Erreurs et cas limites

- Double clic ou deux onglets : l'éligibilité est relue sous verrou, un seul essai est créé (le second reçoit 409).
- Le cron en retard : le plan effectif retombe déjà à FREE ; les annonces en trop sont masquées au passage suivant du cron.
- Réinscription avec un autre e-mail pour obtenir un nouvel essai : non traité (un essai par compte, pas par personne) ; risque accepté.
- Paiement reçu juste avant la fin de l'essai : `grantSubscription` réécrit la ligne en `ACTIVE` ; le cron ne la traite plus comme essai.
- Un abonné annulé (`CANCELED`) ou en grâce ne peut pas démarrer d'essai.

## Hors périmètre

Essai pour les plans Agence, durée réglable dans l'admin, prolongation d'essai, détection d'abus multi-comptes, e-mail marketing de conversion.

## Tests

- Plan effectif : `TRIAL` actif → Pro, à la limite incluse, après la fin → FREE sans grâce.
- Route : 401, 403 non-agent, 201 avec les bonnes valeurs sans jeton ni boost ; 409 si essai déjà pris, abonné payant passé, `GRACE`, `CANCELED`, `EXPIRED` ; annonces masquées réactivées ; double demande simultanée → un seul essai.
- `GET /me` : `trialEligible` pour chaque cas.
- Cycle de vie : rappel J-3 dédupliqué ; fin d'essai → `EXPIRED`/`FREE`, annonces et alertes en trop retirées, notification ; second passage sans effet ; `ACTIVE` payant non touché.
- Paiement pendant l'essai : période de 30 jours depuis le paiement, statut `ACTIVE`, jetons/boosts accordés, `trialStartedAt` conservé.
- Parcours local scripté (essai, quotas Pro, expiration simulée par la date, ré-essai refusé, paiement simulé) avant déploiement.

## Déploiement

Une migration (colonne `trialStartedAt`) à appliquer après `20261014140000_lead_purchases`. Aucun nouveau cron : le cron horaire existant porte la logique.
