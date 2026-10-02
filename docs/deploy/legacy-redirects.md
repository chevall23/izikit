# Redirections des anciennes URL (site PHP → refonte)

Le site PHP d'habitat-afrik.com a été remplacé par la refonte le 2026-10-01. Les anciennes URL
restent indexées (Google, liens partagés sur WhatsApp/Facebook) : chaque ancienne page est
redirigée en **301** vers son équivalent exact quand il existe, sinon vers la page la plus proche.

## Côté application

| Route | Rôle |
| --- | --- |
| `GET /ancienne-annonce/<idannonce>` | 301 vers `/annonces/<slug>-<id>` (annonce importée avec `legacyId = "ann:<idannonce>"`, statut VERIFIED), sinon `/annonces` |
| `GET /ancien-agent/<iddem>` | 301 vers `/agents/<id>` (agent importé avec `legacyId = "dem:<iddem>"`), sinon `/agents` |

Code : [frontend/src/lib/server/public/legacy-redirect.ts](../../frontend/src/lib/server/public/legacy-redirect.ts).
Les articles du blog gardent leur slug (`pnpm import:legacy-blog`) : `/<slug>.php` → `/blog/<slug>`.

Ces routes ne sont **pas** bloquées dans robots.txt : Google doit pouvoir les suivre pour
transférer le référencement des anciennes URL.

## Côté Apache (compte N0C `habiwpes`)

Les anciennes URL passaient l'id en query string (`detail-annonce.php?annonce=123`,
`demarcheur-detail.php?demarcheur=45`), d'où les `RewriteCond %{QUERY_STRING}`.

### `~/public_html/.htaccess` (habitat-afrik.com) — à insérer après le bloc « Force HTTPS »

```apache
# www -> domaine nu (une seule version du site dans Google)
RewriteCond %{HTTP_HOST} ^www\.habitat-afrik\.com$ [NC]
RewriteRule (.*) https://habitat-afrik.com/$1 [L,R=301]

# Fiches annonce / agent de l'ancien site -> page exacte de la refonte
RewriteCond %{QUERY_STRING} (?:^|&)annonce=([0-9]+)
RewriteRule ^detail-annonce\.php$ /ancienne-annonce/%1? [R=301,L]
RewriteCond %{QUERY_STRING} (?:^|&)demarcheur=([0-9]+)
RewriteRule ^demarcheur-detail\.php$ /ancien-agent/%1? [R=301,L]

# Articles du blog (même slug) et pages d'information
RewriteRule ^(4-regle-dor-pour-prendre-une-photo-dannonce-reussie|5-raisons-pour-mettre-votre-annonce-sur-habitat-afrik|7-conseils-pour-etre-un-bon-agent-immobilier|comment-avoir-son-titre-foncier-au-benin|comment-realiser-des-economies-sur-votre-facture-electricite|difference-entre-un-architecte-et-un-architecte-interieur|louer-un-appartement-de-vacance-a-lome|ou-investir-dans-immobilier-au-benin|ou-investir-dans-immobilier-au-togo|pourquoi-installer-des-panneaux-solaires-chez-vous|quel-hebergement-choisir-pour-votre-sejour-a-cotonou|trouver-un-terrain-au-pays)\.php$ /blog/$1? [R=301,L]
RewriteRule ^(a-propos-habitat-afrik|a-propos-daa-immo)\.php$ /a-propos? [R=301,L]
RewriteRule ^(cgu-habitat-afrik|cgu-daa-immo)\.php$ /cgu? [R=301,L]
RewriteRule ^soumettre-une-demande\.php$ /demande-immobiliere/nouvelle? [R=301,L]
```

Les règles génériques existantes (`*.php` → `/annonces`, `/agents`, `/blog`, `/`) restent en
dessous et attrapent le reste.

### Sous-domaines pays `bj.` et `tg.` — remplacent la redirection « tout vers l'accueil »

`<PAYS>` = `benin` pour `bj.habitat-afrik.com`, `togo` pour `tg.habitat-afrik.com`.

```apache
RewriteEngine on
RewriteRule ^\.well-known/ - [L]

RewriteCond %{QUERY_STRING} (?:^|&)annonce=([0-9]+)
RewriteRule ^detail-annonce\.php$ https://habitat-afrik.com/ancienne-annonce/%1? [R=301,L]
RewriteCond %{QUERY_STRING} (?:^|&)demarcheur=([0-9]+)
RewriteRule ^demarcheur-detail\.php$ https://habitat-afrik.com/ancien-agent/%1? [R=301,L]

RewriteRule ^(4-regle-dor-pour-prendre-une-photo-dannonce-reussie|5-raisons-pour-mettre-votre-annonce-sur-habitat-afrik|7-conseils-pour-etre-un-bon-agent-immobilier|comment-avoir-son-titre-foncier-au-benin|comment-realiser-des-economies-sur-votre-facture-electricite|difference-entre-un-architecte-et-un-architecte-interieur|louer-un-appartement-de-vacance-a-lome|ou-investir-dans-immobilier-au-benin|ou-investir-dans-immobilier-au-togo|pourquoi-installer-des-panneaux-solaires-chez-vous|quel-hebergement-choisir-pour-votre-sejour-a-cotonou|trouver-un-terrain-au-pays)\.php$ https://habitat-afrik.com/blog/$1? [R=301,L]
RewriteRule ^(blog-habitatafrik|blog-details)\.php$ https://habitat-afrik.com/blog? [R=301,L]
RewriteRule ^(a-propos-habitat-afrik|a-propos-daa-immo)\.php$ https://habitat-afrik.com/a-propos? [R=301,L]
RewriteRule ^(cgu-habitat-afrik|cgu-daa-immo)\.php$ https://habitat-afrik.com/cgu? [R=301,L]
RewriteRule ^(demarcheurs-habitat-afrik|demarcheurs-daa-immo|rechercher-agent-immobilier)\.php$ https://habitat-afrik.com/agents? [R=301,L]
RewriteRule ^soumettre-une-demande\.php$ https://habitat-afrik.com/demande-immobiliere/nouvelle? [R=301,L]
RewriteRule ^(acces-compte)\.php$ https://habitat-afrik.com/login? [R=301,L]

# Accueil et listes du sous-domaine pays -> page du pays
RewriteRule .* https://habitat-afrik.com/immobilier/<PAYS>? [R=301,L]
```

Les sous-domaines `ci.`, `sn.`, `alerte.`, `admin.`, `demarcheur.`, `compte.` gardent leur
redirection actuelle (voir [n0c-setup.md](n0c-setup.md)).

### Vérification

```bash
curl -sI "https://habitat-afrik.com/detail-annonce.php?annonce=<id>" | grep -i location
curl -sI "https://bj.habitat-afrik.com/comment-avoir-son-titre-foncier-au-benin.php" | grep -i location
curl -sI "https://www.habitat-afrik.com/annonces" | grep -i location
```

Ensuite dans Google Search Console : « Changement d'adresse » des propriétés `bj.` et `tg.` vers
`habitat-afrik.com`, et soumission de `https://habitat-afrik.com/sitemap.xml`.
