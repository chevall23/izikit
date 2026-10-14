# Monétisation phase 1E — Statistiques par niveau et export

Date : 2026-10-14. Dernier morceau de la phase 1 (après 1A droits des plans, 1B boosts, 1C leads, 1D essai Pro).

## Objectif

La grille des plans promet des statistiques « basiques » (Gratuit), « complètes » (Pro) et « avancées + export » (Agence). Aujourd'hui l'écran `/statistiques` et son API sont identiques pour tout le monde et le bouton « Exporter » est désactivé. 1E applique les niveaux côté serveur, ajoute un aperçu flouté « Passer à Pro » pour le Gratuit et un export CSV pour l'Agence.

## Décisions (validées)

- Répartition **par blocs, par durée et par export**.
- Aperçu flouté + bouton « Passer à Pro » pour les blocs verrouillés ; **l'API ne renvoie aucune donnée réelle** de ces blocs au Gratuit (le flou est un décor statique, jamais les vraies valeurs).

## État actuel (vérifié dans le code)

- `GET /api/listings/stats?period=7j|30j|3m|1a` renvoie, pour tout utilisateur connecté : indicateurs, courbe des vues, répartition des annonces par statut, contacts par jour, suivi des documents, top annonces, sources de trafic, totaux.
- `/statistiques` consomme tout ; `/dashboard` consomme la même API pour les indicateurs, la répartition par statut, les contacts par jour et le suivi des documents (période 30 j).
- Le plan effectif d'un utilisateur s'obtient par `getEffectivePlanKey` (inclut l'essai Pro).
- Les textes de plans disent déjà « Statistiques basiques / complètes / avancées » (`subscription-plans.ts`).

## Design

### 1. Niveaux

`PLAN_CATALOG[plan].statsLevel` : `FREE → 'BASIC'`, `PRO_AGENT → 'FULL'`, `AGENCY_PREMIUM → 'ADVANCED'` (constante du code, non éditable dans l'admin). Le niveau d'un utilisateur est celui de son **plan effectif** (essai Pro compris, période de grâce comprise, plan gratuit après expiration).

| Bloc / capacité | BASIC (Gratuit) | FULL (Pro) | ADVANCED (Agence) |
|---|---|---|---|
| 4 indicateurs, répartition par statut, contacts par jour, suivi des documents, totaux | oui | oui | oui |
| Périodes 7 j et 30 j | oui | oui | oui |
| Périodes 3 mois et 1 an | non | oui | oui |
| Courbe des vues, top annonces, sources de trafic | non (verrouillé) | oui | oui |
| Export CSV | non | non | oui |

Le tableau de bord (`/dashboard`) n'utilise que des blocs gratuits : il n'est pas modifié.

### 2. API `GET /api/listings/stats`

- Lit le plan effectif de l'utilisateur et en déduit le niveau.
- Période `3m` ou `1a` avec le niveau BASIC : **403** `PLAN_REQUIRED` (message « Cette période est réservée au plan Pro. »), sans requête de calcul.
- Pour BASIC, `viewsTimeseries`, `topListings`, `trafficSources` sont renvoyés **vides** et leurs requêtes ne sont pas exécutées (économie de requêtes) ; la réponse gagne `level: 'BASIC' | 'FULL' | 'ADVANCED'`, `locked: string[]` (noms des blocs verrouillés) et `canExport: boolean`.
- Pour FULL et ADVANCED : réponse inchangée, plus `level`, `locked: []`, `canExport` (vrai seulement pour ADVANCED).

### 3. Export `GET /api/listings/stats/export?period=…`

- `runtime = 'nodejs'`, `requireAuth`. Niveau inférieur à ADVANCED : 403 `PLAN_REQUIRED` (« L'export est réservé au plan Agence. »). Période invalide : 400 ; 30 j par défaut.
- Réponse `text/csv; charset=utf-8` avec BOM UTF-8, séparateur `;`, fin de ligne `\r\n`, `Content-Disposition: attachment; filename="statistiques-<période>-<AAAA-MM-JJ>.csv"`, `Cache-Control: no-store`.
- Contenu en trois sections séparées par une ligne vide : **Indicateurs** (vues, contacts, visites, taux de conversion, avec la variation en %) ; **Vues par jour** (date, vues) ; **Détail par annonce** (titre, ville, pays, type de bien, transaction, statut, prix, devise, vues sur la période, contacts sur la période), pour les annonces non brouillon de l'utilisateur.
- Neutralisation de l'injection de formules : toute cellule texte commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot est préfixée par une apostrophe ; guillemets doublés, cellule entre guillemets si elle contient `;`, `"` ou un saut de ligne.
- Les données suivent les mêmes agrégations que l'API des statistiques (même périmètre : les annonces de l'utilisateur).

### 4. Interface `/statistiques`

- Boutons de période 3 mois / 1 an : désactivés avec un cadenas pour le niveau BASIC (info-bulle « Plan Pro »).
- Blocs verrouillés (courbe des vues, top annonces, sources de trafic) : la carte garde son titre, son contenu est un dessin factice statique flouté (`blur`, non sélectionnable) avec une surcouche « Disponible avec le plan Pro » et un bouton « Passer à Pro » vers `/settings` (onglet abonnement). Aucune valeur réelle n'est dans le DOM.
- Bouton « Exporter » : actif pour l'Agence (télécharge le CSV de la période affichée) ; pour les autres, affiché avec un cadenas et une info-bulle « Plan Agence » qui renvoie vers l'abonnement.
- Les agents en essai Pro voient le niveau FULL jusqu'à la fin de l'essai.

## Erreurs et cas limites

- Abonnement expiré pendant la consultation : la prochaine requête renvoie le niveau BASIC ; une période 3 m / 1 a déjà affichée reçoit 403 et l'écran retombe sur 30 j avec un message.
- Un agent Pro qui passe au Gratuit : accès conservé aux blocs gratuits, perte des autres au prochain chargement.
- Export d'un compte sans annonces : fichier valide avec les sections d'en-têtes et des totaux à zéro.
- Titre d'annonce contenant `=cmd|...` : exporté préfixé d'une apostrophe.
- Volume : le détail par annonce est limité aux annonces non brouillon de l'utilisateur ; aucune pagination (même hypothèse que l'API existante).

## Hors périmètre

Graphiques supplémentaires propres à l'Agence, statistiques multi-sièges / par agent d'agence, export PDF ou Excel natif, envoi planifié par e-mail, comparaison entre annonces.

## Tests

- Plan effectif → niveau (Gratuit, Pro, Agence, essai, grâce, expiré).
- API : BASIC reçoit les blocs gratuits, des blocs verrouillés vides sans requête de calcul, `locked` et `canExport: false` ; `3m`/`1a` refusés en 403 pour BASIC ; FULL reçoit tout et `canExport: false` ; ADVANCED `canExport: true` ; périmètre toujours limité à l'utilisateur.
- Export : 401, 403 pour Gratuit et Pro, 400 période invalide, en-têtes de téléchargement, BOM, trois sections, échappement et neutralisation des formules, vues et contacts par annonce corrects, compte sans annonces.
- Parcours local scripté (trois comptes de niveaux différents : API, périodes, export) avant déploiement ; contrôle visuel de l'écran.

## Déploiement

Aucune migration, aucun cron, aucune variable d'environnement. Code seul.
