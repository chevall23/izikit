# Import des données de l'ancien site (habitat-afrik.com) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un script CLI ré-exécutable (`pnpm import:legacy`) qui lit le dump MySQL de l'ancien site PHP et la sauvegarde des photos, puis importe agents, clients, annonces, photos (vers R2), alertes secteur, demandes publiques et soldes de jetons dans la base Prisma de la refonte.

**Architecture :** trois couches séparées sous `frontend/scripts/legacy-import/`. (1) `parse-dump.ts` transforme le texte SQL en lignes JS. (2) `build.ts` + `mappers.ts` sont **purs** : ils transforment les lignes legacy en un `ImportSet` typé (toutes les règles métier vivent ici, testées unitairement). (3) `write.ts` / `photos.ts` font les upserts Prisma et les envois R2, idempotents grâce à une colonne `legacyId` unique. Le point d'entrée `scripts/import-legacy.ts` orchestre et imprime un rapport.

**Tech Stack :** TypeScript strict, tsx, Prisma 5 / PostgreSQL, Vitest, `uploadBuffer` (R2) de `src/lib/server/upload/storage-client.ts`.

**Spec :** pas de document séparé — les décisions validées par l'utilisateur le 2026-10-01 sont reprises dans « Décisions » ci-dessous et font foi.

## Décisions (validées)

- **Mots de passe : réinitialisation obligatoire.** Aucun hash legacy importé (`passwordHash = null`). Les utilisateurs passent par « Mot de passe oublié » (fonctionne déjà pour tout `User` ayant un e-mail, cf. `src/app/api/auth/forgot-password/route.ts:86`). Un encart sur `/login` l'explique.
- **Clients (`tblclient`) : seulement ceux avec un e-mail valide** (~267 sur 2 258). Les autres sont ignorés.
- **Annonces : `confid=1` → `VERIFIED`, sinon `DRAFT`.** Une annonce sans prix exploitable, sans type de bien ou sans type de transaction est forcée en `DRAFT`.
- **Agents (`tbldemarcheur`) → `User` `OWNER_AGENT`**, tous `ACTIVE` (la sémantique de `etat` 0/1 dans l'ancien admin est ambiguë — on ne suspend personne). `etat` non numérique (= code de vérification en attente) → `emailVerifiedAt = null`.
- **Doublons d'e-mail entre agents** (37) : on garde un seul compte (priorité `etat='1'`, puis le plus récent) ; les annonces/alertes/jetons des doublons sont rattachés au compte gardé.
- **Agents sans e-mail** (28) : importés avec un e-mail factice `legacy-dem-<iddem>@import.habitat-afrik.invalid`, `emailVerifiedAt = null` (ils ne peuvent pas se connecter tant qu'un admin n'a pas corrigé l'e-mail ; leurs annonces restent rattachées).
- **Pas importé :** messagerie (`tblimodamamsg*`), stories, packs (tous `free`/expirés), codes promo, réservations, avis (`tblavis` n'a ni auteur ni note — incompatible avec `AgentReview`), favoris (aucun modèle dans la refonte), avatars.
- **Alertes secteur** : une alerte legacy couvre tous les types → 2 `Alert` par ligne legacy (`VENTE` et `LOCATION`), tous les `propertyTypes`.
- **Aucune notification déclenchée par l'import** : on écrit directement via Prisma, on n'appelle ni `matching.ts` ni l'outbox.
- **Photos** : clé R2 `legacy/listings/<idannonce>/<idgal>` (basée sur les IDs legacy → un ré-envoi écrase le même objet, pas d'orphelins entre l'essai et l'import final).

## Global Constraints

- Le dump et les photos restent hors git (`ancien version habitatafrik/` est exclu via `.git/info/exclude`) — le script reçoit leurs chemins en arguments, rien n'est copié dans le repo.
- Montants entiers en FCFA (`Int`), jamais de décimales.
- Dates legacy = heure locale `Africa/Porto-Novo` (UTC+1, sans heure d'été) → convertir avec le suffixe `+01:00`.
- Pays au format de `src/lib/countries.ts` : `'Bénin'`, `'Togo'`, `"Côte d'Ivoire"`, `'Sénégal'`.
- Types de biens/transactions = clés de `PROPERTY_TYPE_LABEL` / `TRANSACTION_TYPE_LABEL` (`src/lib/listings.ts`).
- Fichiers protégés (CLAUDE.md) non modifiés : on importe `uploadBuffer` mais on ne touche ni `auth.ts`, ni `api.ts`, ni les routes OAuth.
- Les commandes Prisma CLI en local utilisent la base locale `postgresql://…@localhost:5433/…` en override explicite de `DATABASE_URL` (le quota Neon saute souvent).
- Avant commit : `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (depuis la racine).

## Review Focus

1. **Ré-exécution** (essai maintenant, import final le jour de la bascule sur un dump frais) : un second run ne doit créer aucun doublon et ne jamais écraser un `passwordHash` → test de `resolveUserAction` (Task 4) + double exécution vérifiée en Task 6.
2. **E-mail déjà présent dans la nouvelle base** (compte créé sur la refonte par un ancien agent) : on rattache (`legacyId` posé sur le compte existant), on n'écrase ni mot de passe ni nom → test de `resolveUserAction` (Task 4).
3. **Téléphones en double** (68) : `User.phone` est unique → seul le premier garde le numéro → test de `buildImportSet` (Task 3).
4. **Textes legacy avec quotes échappées, retours ligne, `);` dans une description** → tests du parser (Task 2).
5. **Prix sale** (`"2.02"`, `""`, `"1.500.000"`, `"150 000"`) → tests de `parsePrice` (Task 3) ; une annonce au prix illisible devient `DRAFT` avec `price = 0`.
6. **Photo référencée mais absente du disque** (108 cas) → ignorée et comptée dans le rapport, n'interrompt pas l'import → test de `importPhotos` (Task 5).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `frontend/prisma/schema.prisma` | + `legacyId String? @unique` sur `User`, `Listing`, `ListingPhoto`, `Alert`, `PropertyRequest` |
| `frontend/prisma/migrations/<ts>_legacy_import_ids/migration.sql` | migration générée |
| `frontend/scripts/legacy-import/parse-dump.ts` (+ `.test.ts`) | parser des `INSERT INTO` MySQL |
| `frontend/scripts/legacy-import/mappers.ts` (+ `.test.ts`) | fonctions pures : téléphone, e-mail, prix, dates, types, pays |
| `frontend/scripts/legacy-import/build.ts` (+ `.test.ts`) | lignes legacy → `ImportSet` (dédoublonnage, statuts, rattachements) |
| `frontend/scripts/legacy-import/write.ts` (+ `.test.ts`) | upserts Prisma idempotents |
| `frontend/scripts/legacy-import/photos.ts` (+ `.test.ts`) | envoi R2 + `ListingPhoto`, reprenable |
| `frontend/scripts/import-legacy.ts` | CLI : args, orchestration, rapport |
| `frontend/package.json` | script `import:legacy` |
| `frontend/src/app/login/page.tsx` | encart « Vous aviez un compte sur l'ancien site ? » |

---

### Task 1 : Colonnes `legacyId` + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (modèles `User`, `Listing`, `ListingPhoto`, `Alert`, `PropertyRequest`)
- Create: `frontend/prisma/migrations/<timestamp>_legacy_import_ids/migration.sql` (généré)

**Interfaces:**
- Produces : champ `legacyId: string | null` (unique) sur les 5 modèles. Formats : `User` = `"dem:<iddem>"` ou `"cli:<idcli>"` ; `Listing` = `"ann:<idannonce>"` ; `ListingPhoto` = `"gal:<idgal>"` ; `Alert` = `"alerte:<idalerte>:<VENTE|LOCATION>"` ; `PropertyRequest` = `"demande:<iddemandes>"`.

- [ ] **Step 1 : Ajouter le champ dans chacun des 5 modèles**

Dans `model User`, juste avant `createdAt` :

```prisma
  // Identifiant de l'ancien site PHP (habitat-afrik.com) — "dem:<iddem>" pour
  // un démarcheur, "cli:<idcli>" pour un client. Rend l'import
  // `pnpm import:legacy` ré-exécutable. null pour les comptes créés ici.
  legacyId            String?   @unique
```

Dans `model Listing`, `model ListingPhoto`, `model Alert`, `model PropertyRequest`, juste avant `createdAt` :

```prisma
  // Identifiant de l'ancien site — voir scripts/legacy-import/. null si créé ici.
  legacyId String? @unique
```

- [ ] **Step 2 : Générer la migration sur la base locale**

Run (depuis `frontend/`, PowerShell) :
```powershell
$env:DATABASE_URL = "<URL locale localhost:5433 de .env.local>"; pnpm exec prisma migrate dev --name legacy_import_ids
```
Expected : `Your database is now in sync with your schema`, un dossier `prisma/migrations/*_legacy_import_ids/` contenant 5 `ADD COLUMN "legacyId" TEXT` + 5 `CREATE UNIQUE INDEX`.

- [ ] **Step 3 : Vérifier typecheck + tests**

Run : `pnpm typecheck && pnpm test` (racine). Expected : vert (aucun code n'utilise encore le champ).

- [ ] **Step 4 : Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(db): add legacyId columns for the legacy-site import"
```

---

### Task 2 : Parser du dump MySQL

**Files:**
- Create: `frontend/scripts/legacy-import/parse-dump.ts`
- Test: `frontend/scripts/legacy-import/parse-dump.test.ts`

**Interfaces:**
- Produces :
  ```ts
  export type SqlValue = string | number | null;
  export type SqlRow = Record<string, SqlValue>;
  export function parseDump(sql: string, only?: ReadonlySet<string>): Record<string, SqlRow[]>;
  ```
  Format attendu : export phpMyAdmin (`INSERT INTO \`t\` (\`a\`, \`b\`) VALUES\n(1, 'x'),\n(2, 'y');`). Les chaînes restent des `string`, les nombres non quotés deviennent `number`, `NULL` → `null`.

- [ ] **Step 1 : Écrire les tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseDump } from './parse-dump';

const SQL = `
CREATE TABLE \`tblpays\` (\`idpays\` int(11) NOT NULL);
INSERT INTO \`tblpays\` (\`idpays\`, \`pays\`, \`logo\`) VALUES
(1, 'benin', NULL),
(2, 'côte d\\'ivoire', 'ci.png');
INSERT INTO \`tblannonce\` (\`idannonce\`, \`description\`, \`prix\`) VALUES
(10, 'Ligne 1\\r\\nLigne 2 ); piège', '150000'),
(11, 'It''s ok, (vraiment)', '-1');
INSERT INTO \`tblpays\` (\`idpays\`, \`pays\`, \`logo\`) VALUES
(3, 'togo', '');
`;

describe('parseDump', () => {
  it('parses every INSERT and merges multiple INSERTs of the same table', () => {
    const d = parseDump(SQL);
    expect(d.tblpays).toEqual([
      { idpays: 1, pays: 'benin', logo: null },
      { idpays: 2, pays: "côte d'ivoire", logo: 'ci.png' },
      { idpays: 3, pays: 'togo', logo: '' },
    ]);
  });

  it('handles backslash escapes, doubled quotes and ");" inside strings', () => {
    const d = parseDump(SQL);
    expect(d.tblannonce?.[0]).toEqual({ idannonce: 10, description: 'Ligne 1\r\nLigne 2 ); piège', prix: '150000' });
    expect(d.tblannonce?.[1]?.description).toBe("It's ok, (vraiment)");
  });

  it('keeps only the requested tables when `only` is given', () => {
    const d = parseDump(SQL, new Set(['tblannonce']));
    expect(Object.keys(d)).toEqual(['tblannonce']);
  });

  it('throws on a truncated dump instead of looping forever', () => {
    expect(() => parseDump("INSERT INTO `t` (`a`) VALUES\n(1, 'oops")).toThrow(/truncated/i);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `pnpm --filter frontend exec vitest run scripts/legacy-import/parse-dump.test.ts`
Expected : FAIL (`Cannot find module './parse-dump'`).

- [ ] **Step 3 : Implémenter**

```ts
// Minimal parser for phpMyAdmin MySQL dumps: extracts the rows of every
// `INSERT INTO \`table\` (cols) VALUES (...), (...);` statement. Only what the
// legacy import needs — no CREATE TABLE parsing, no hex/binary literals.

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' };

function truncated(): never {
  throw new Error('parseDump: truncated dump (unterminated INSERT)');
}

function skipWs(s: string, i: number): number {
  while (i < s.length && (s[i] === ' ' || s[i] === '\n' || s[i] === '\r' || s[i] === '\t')) i++;
  return i;
}

function readValues(s: string, start: number, cols: string[]): { rows: SqlRow[]; end: number } {
  const rows: SqlRow[] = [];
  let i = start;
  for (;;) {
    i = skipWs(s, i);
    if (s[i] !== '(') truncated();
    i++;
    const values: SqlValue[] = [];
    for (;;) {
      i = skipWs(s, i);
      if (i >= s.length) truncated();
      if (s[i] === "'") {
        i++;
        let v = '';
        for (;;) {
          if (i >= s.length) truncated();
          const c = s[i] as string;
          if (c === '\\') {
            const n = s[i + 1] ?? truncated();
            v += ESCAPES[n] ?? n;
            i += 2;
          } else if (c === "'") {
            if (s[i + 1] === "'") {
              v += "'";
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            v += c;
            i++;
          }
        }
        values.push(v);
      } else {
        let j = i;
        while (j < s.length && s[j] !== ',' && s[j] !== ')') j++;
        if (j >= s.length) truncated();
        const raw = s.slice(i, j).trim();
        values.push(raw === 'NULL' ? null : Number(raw));
        i = j;
      }
      i = skipWs(s, i);
      if (s[i] === ',') {
        i++;
        continue;
      }
      if (s[i] === ')') {
        i++;
        break;
      }
      truncated();
    }
    rows.push(Object.fromEntries(cols.map((c, k) => [c, values[k] ?? null])));
    i = skipWs(s, i);
    if (s[i] === ',') {
      i++;
      continue;
    }
    if (s[i] === ';') return { rows, end: i + 1 };
    truncated();
  }
}

export function parseDump(sql: string, only?: ReadonlySet<string>): Record<string, SqlRow[]> {
  const out: Record<string, SqlRow[]> = {};
  const re = /INSERT INTO `([^`]+)` \(([^)]*)\) VALUES/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1] as string;
    const cols = (m[2] as string).split(',').map((c) => c.trim().replace(/`/g, ''));
    const { rows, end } = readValues(sql, re.lastIndex, cols);
    re.lastIndex = end;
    if (only && !only.has(table)) continue;
    (out[table] ??= []).push(...rows);
  }
  return out;
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run : `pnpm --filter frontend exec vitest run scripts/legacy-import/parse-dump.test.ts` → 4 PASS.

- [ ] **Step 5 : Vérification sur le vrai dump (lecture seule)**

Run (depuis `frontend/`) :
```powershell
pnpm exec tsx -e "import {readFileSync} from 'node:fs'; import {parseDump} from './scripts/legacy-import/parse-dump'; const d=parseDump(readFileSync('../ancien version habitatafrik/habiwpes_daa-immo-bdwafy.sql','utf8')); console.log(d.tbldemarcheur?.length, d.tblannonce?.length, d.tblgalerie?.length)"
```
Expected : `1128 4456 20019` (± si le dump a été rafraîchi).

- [ ] **Step 6 : Commit**

```bash
git add frontend/scripts/legacy-import/parse-dump.ts frontend/scripts/legacy-import/parse-dump.test.ts
git commit -m "feat(import): MySQL dump parser for the legacy-site import"
```

---

### Task 3 : Mappers purs + `buildImportSet`

**Files:**
- Create: `frontend/scripts/legacy-import/mappers.ts`, `frontend/scripts/legacy-import/build.ts`
- Test: `frontend/scripts/legacy-import/mappers.test.ts`, `frontend/scripts/legacy-import/build.test.ts`

**Interfaces:**
- Consumes : `SqlRow` (Task 2).
- Produces (`mappers.ts`) :
  ```ts
  export const COUNTRY_BY_ID: Record<number, string>;
  export const COUNTRY_BY_CODE: Record<string, string>;
  export const DIAL_BY_COUNTRY: Record<string, string>;
  export function str(v: SqlValue | undefined): string;           // trim, null → ''
  export function int(v: SqlValue | undefined): number | null;    // entier > 0 sinon null
  export function normalizeEmail(raw: SqlValue | undefined): string | null;
  export function normalizePhone(raw: SqlValue | undefined, dial?: string | null): string | null;
  export function parsePrice(raw: SqlValue | undefined): number | null;
  export function parseLegacyDate(raw: SqlValue | undefined): Date | null;
  export function mapPropertyType(idtype: SqlValue | undefined): string | null;
  export function mapTransactionType(type: SqlValue | undefined): 'VENTE' | 'LOCATION' | 'SEJOUR' | 'AUBERGE' | null;
  export function mapRequestTransaction(action: SqlValue | undefined): 'VENTE' | 'LOCATION' | 'SEJOUR' | null;
  ```
- Produces (`build.ts`) :
  ```ts
  export interface UserRecord { legacyId: string; email: string; phone: string | null; name: string | null; bio: string | null; country: string | null; accountType: 'OWNER_AGENT' | 'TENANT_BUYER'; emailVerifiedAt: Date | null; createdAt: Date; }
  export interface ListingRecord { legacyId: string; ownerLegacyId: string; title: string; city: string; country: string; propertyType: string; transactionType: string; price: number; status: 'VERIFIED' | 'DRAFT'; description: string | null; landmark: string | null; surfaceM2: number | null; bedrooms: number | null; bathrooms: number | null; kitchens: number | null; viewCount: number; createdAt: Date; }
  export interface PhotoRecord { legacyId: string; listingLegacyId: string; legacyListingId: number; idgal: number; filename: string; isPrimary: boolean; position: number; }
  export interface AlertRecord { legacyId: string; ownerLegacyId: string; name: string; transactionType: 'VENTE' | 'LOCATION'; propertyTypes: string[]; country: string; cities: string[]; notifWhatsapp: boolean; notifEmail: boolean; active: boolean; createdAt: Date; }
  export interface RequestRecord { legacyId: string; transactionType: string; propertyType: string; country: string; city: string; bedrooms: string | null; salons: string | null; surfaceM2: number | null; budgetMin: number | null; budgetMax: number | null; clientPhone: string; clientEmail: string | null; notes: string | null; status: 'EN_ATTENTE' | 'CLOTUREE'; createdAt: Date; }
  export interface WalletRecord { ownerLegacyId: string; balance: number; }
  export interface ImportSet { users: UserRecord[]; listings: ListingRecord[]; photos: PhotoRecord[]; alerts: AlertRecord[]; requests: RequestRecord[]; wallets: WalletRecord[]; skipped: Record<string, number>; }
  export function buildImportSet(d: Record<string, SqlRow[]>, now?: Date): ImportSet;
  export const LEGACY_TABLES: ReadonlySet<string>;
  ```

- [ ] **Step 1 : Tests des mappers**

```ts
import { describe, expect, it } from 'vitest';
import {
  mapPropertyType, mapRequestTransaction, mapTransactionType, normalizeEmail,
  normalizePhone, parseLegacyDate, parsePrice,
} from './mappers';

describe('parsePrice', () => {
  it.each([
    ['150000', 150000], [' 150 000 ', 150000], ['1.500.000', 1500000], ['1,500,000', 1500000],
    [400000000, 400000000],
  ])('%s → %s', (raw, out) => expect(parsePrice(raw)).toBe(out));
  it.each(['', '0', '2.02', 'null', 'à débattre', null, '-5'])('%s → null', (raw) => expect(parsePrice(raw)).toBeNull());
});

describe('normalizePhone', () => {
  it('keeps numbers already carrying a known dial code', () => expect(normalizePhone('22966969961')).toBe('+22966969961'));
  it('honours + and 00 prefixes', () => {
    expect(normalizePhone('+33 7 45 54 86 95')).toBe('+33745548695');
    expect(normalizePhone('0022890112233')).toBe('+22890112233');
  });
  it('prefixes local numbers with the agent country dial', () => expect(normalizePhone('90 11 22 33', '228')).toBe('+22890112233'));
  it('returns null for junk', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('90112233')).toBeNull(); // local, no country known
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => expect(normalizeEmail(' Roger.Sogan@Gmail.com ')).toBe('roger.sogan@gmail.com'));
  it.each(['c:/', '', 'foo@bar', 'a b@c.com', null])('rejects %s', (raw) => expect(normalizeEmail(raw)).toBeNull());
});

describe('parseLegacyDate', () => {
  it('reads datetimes as Africa/Porto-Novo (UTC+1)', () =>
    expect(parseLegacyDate('2025-05-16 07:42:49')?.toISOString()).toBe('2025-05-16T06:42:49.000Z'));
  it('reads plain dates', () => expect(parseLegacyDate('2022-10-26')?.toISOString()).toBe('2022-10-25T23:00:00.000Z'));
  it.each(['0000-00-00 00:00:00', '', null, 'n/a'])('rejects %s', (raw) => expect(parseLegacyDate(raw)).toBeNull());
});

describe('type mappings', () => {
  it('maps legacy property type ids', () => {
    expect(mapPropertyType(1)).toBe('VILLA');
    expect(mapPropertyType(3)).toBe('BOUTIQUE'); // ENTREPOT
    expect(mapPropertyType(12)).toBe('MAISON'); // DUPLEX
    expect(mapPropertyType(13)).toBe('PARCELLE');
    expect(mapPropertyType(15)).toBe('DOMAINE'); // ECOLODGE
    expect(mapPropertyType(0)).toBeNull();
  });
  it('maps transaction types case-insensitively', () => {
    expect(mapTransactionType('Vente')).toBe('VENTE');
    expect(mapTransactionType('location')).toBe('LOCATION');
    expect(mapTransactionType('vacance')).toBe('SEJOUR');
    expect(mapTransactionType('auberge')).toBe('AUBERGE');
    expect(mapTransactionType('undefined')).toBeNull();
  });
  it('maps public request actions', () => {
    expect(mapRequestTransaction('louer')).toBe('LOCATION');
    expect(mapRequestTransaction('acheter')).toBe('VENTE');
    expect(mapRequestTransaction('???')).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer → FAIL** (`pnpm --filter frontend exec vitest run scripts/legacy-import/mappers.test.ts`).

- [ ] **Step 3 : Implémenter `mappers.ts`**

```ts
// Pure value mappers from the legacy PHP site's MySQL schema to the Prisma
// schema. No I/O. Mapping tables reflect decisions recorded in
// docs/superpowers/plans/2026-10-01-legacy-data-import.md.
import type { SqlValue } from './parse-dump';

export const COUNTRY_BY_ID: Record<number, string> = { 1: 'Bénin', 2: 'Togo', 3: "Côte d'Ivoire", 4: 'Sénégal' };
export const COUNTRY_BY_CODE: Record<string, string> = { BJ: 'Bénin', TG: 'Togo', CI: "Côte d'Ivoire", SN: 'Sénégal' };
export const DIAL_BY_COUNTRY: Record<string, string> = { Bénin: '229', Togo: '228', "Côte d'Ivoire": '225', Sénégal: '221' };
const KNOWN_DIALS = Object.values(DIAL_BY_COUNTRY);

// tbltypebien.idtype → PROPERTY_TYPE_LABEL key. Types absent de la refonte :
// ENTREPOT(3)→BOUTIQUE, DUPLEX(12)→MAISON, PARCELLE sans/avec TF(8/13)→PARCELLE,
// AUBERGE(14)→MAISON (la transaction AUBERGE porte l'info), ECOLODGE(15)→DOMAINE.
const PROPERTY_TYPE_BY_ID: Record<number, string> = {
  1: 'VILLA', 2: 'MAISON', 3: 'BOUTIQUE', 4: 'APPARTEMENT', 5: 'BOUTIQUE', 6: 'BUREAU',
  7: 'SALLE_FETE', 8: 'PARCELLE', 9: 'IMMEUBLE', 10: 'DOMAINE', 12: 'MAISON', 13: 'PARCELLE',
  14: 'MAISON', 15: 'DOMAINE', 16: 'SALLE_CONFERENCE',
};

export function str(v: SqlValue | undefined): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function int(v: SqlValue | undefined): number | null {
  const n = typeof v === 'number' ? v : Number.parseInt(str(v), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function normalizeEmail(raw: SqlValue | undefined): string | null {
  const e = str(raw).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

export function normalizePhone(raw: SqlValue | undefined, dial?: string | null): string | null {
  const s = str(raw);
  let digits = s.replace(/\D/g, '');
  const international = s.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (international) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length >= 11 && KNOWN_DIALS.some((p) => digits.startsWith(p))) return `+${digits}`;
  if (dial && digits.length >= 8 && digits.length <= 10) return `+${dial}${digits}`;
  return null;
}

export function parsePrice(raw: SqlValue | undefined): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  const s = str(raw).replace(/[\s\u00a0]/g, '');
  if (/^\d+$/.test(s)) return int(s);
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return int(s.replace(/[.,]/g, ''));
  return null;
}

export function parseLegacyDate(raw: SqlValue | undefined): Date | null {
  const s = str(raw);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(s);
  if (!m || m[1] === '0000') return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapPropertyType(idtype: SqlValue | undefined): string | null {
  return PROPERTY_TYPE_BY_ID[Number(idtype)] ?? null;
}

export function mapTransactionType(type: SqlValue | undefined): 'VENTE' | 'LOCATION' | 'SEJOUR' | 'AUBERGE' | null {
  switch (str(type).toLowerCase()) {
    case 'vente': return 'VENTE';
    case 'location': return 'LOCATION';
    case 'vacance': return 'SEJOUR';
    case 'auberge': return 'AUBERGE';
    default: return null;
  }
}

export function mapRequestTransaction(action: SqlValue | undefined): 'VENTE' | 'LOCATION' | 'SEJOUR' | null {
  switch (str(action).toLowerCase()) {
    case 'louer': case 'location': return 'LOCATION';
    case 'acheter': case 'achat': case 'vente': return 'VENTE';
    case 'sejour': case 'séjour': case 'vacance': return 'SEJOUR';
    default: return null;
  }
}
```

- [ ] **Step 4 : Lancer → PASS.** Si `mapRequestTransaction` laisse passer trop de `null` sur le vrai dump, lister les valeurs : `pnpm exec tsx -e "…console.log(new Set(d.tbldemandes.map(r=>r.action)))"` et compléter le `switch`.

- [ ] **Step 5 : Tests de `buildImportSet`**

```ts
import { describe, expect, it } from 'vitest';
import type { SqlRow } from './parse-dump';
import { buildImportSet } from './build';

const NOW = new Date('2026-10-01T12:00:00Z');
const dem = (o: Partial<SqlRow>): SqlRow => ({
  iddem: 1, nom: 'SOGAN', prenom: 'Roger', mail: 'r@x.com', tel: '22966000001', apropos: '',
  datesave: '2024-01-01 10:00:00', etat: '1', codepays: 'BJ', ...o,
});
const base = (): Record<string, SqlRow[]> => ({
  tbldemarcheur: [], tblclient: [], tblannonce: [], tblgalerie: [], tblville: [
    { idville: 1, libville: 'Cotonou', idpays: 1 }, { idville: 41, libville: 'Lomé', idpays: 2 },
  ], tblannonce_vu: [], tblalertesecteur: [], tbldemandes: [], tblportefeuille: [],
});
const ann = (o: Partial<SqlRow>): SqlRow => ({
  idannonce: 100, titre: ' Villa à vendre ', type: 'vente', prix: '50000000', superficie: '300',
  chambre: 4, salon: '1', cuisine: '1', douche: '2', idtype: 1, repere: 'Pharmacie X', idville: 1,
  quartier: 'Fidjrossè', description: 'Belle villa', datesave: '2025-01-01 08:00:00', iddem: 1, confid: 1, ...o,
});

describe('buildImportSet', () => {
  it('dedupes agents by email, keeping the etat=1 account and re-pointing listings', () => {
    const d = base();
    d.tbldemarcheur = [dem({ iddem: 1, etat: '0', datesave: '2025-06-01 00:00:00' }), dem({ iddem: 2, tel: '22966000002' })];
    d.tblannonce = [ann({ iddem: 1 })];
    const s = buildImportSet(d, NOW);
    expect(s.users.map((u) => u.legacyId)).toEqual(['dem:2']);
    expect(s.listings[0]?.ownerLegacyId).toBe('dem:2');
  });

  it('gives agents without email a placeholder and leaves them unverified', () => {
    const d = base();
    d.tbldemarcheur = [dem({ iddem: 7, mail: '' })];
    const u = buildImportSet(d, NOW).users[0];
    expect(u?.email).toBe('legacy-dem-7@import.habitat-afrik.invalid');
    expect(u?.emailVerifiedAt).toBeNull();
  });

  it('marks agents with a pending verification code as unverified', () => {
    const d = base();
    d.tbldemarcheur = [dem({ etat: '7e620' })];
    expect(buildImportSet(d, NOW).users[0]?.emailVerifiedAt).toBeNull();
  });

  it('assigns a duplicated phone only to the first user', () => {
    const d = base();
    d.tbldemarcheur = [dem({ iddem: 1, mail: 'a@x.com', tel: '22966000001' }), dem({ iddem: 2, mail: 'b@x.com', tel: '22966000001' })];
    expect(buildImportSet(d, NOW).users.map((u) => u.phone)).toEqual(['+22966000001', null]);
  });

  it('imports only clients with a valid, unused email', () => {
    const d = base();
    d.tbldemarcheur = [dem({ mail: 'r@x.com' })];
    d.tblclient = [
      { idcli: 1, nom: 'A', prenom: 'B', mail: 'c:/', datesave: '2022-10-26' },
      { idcli: 2, nom: 'A', prenom: 'B', mail: 'R@x.com', datesave: '2022-10-26' },
      { idcli: 3, nom: 'Doe', prenom: 'Jane', mail: 'jane@x.com', datesave: '2022-10-26' },
    ];
    const clients = buildImportSet(d, NOW).users.filter((u) => u.accountType === 'TENANT_BUYER');
    expect(clients.map((u) => u.legacyId)).toEqual(['cli:3']);
  });

  it('maps a visible listing to VERIFIED with country, landmark and view count', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [ann({})];
    d.tblannonce_vu = [{ idannonce: 100, nbrevu: 12 }, { idannonce: 100, nbrevu: 3 }];
    expect(buildImportSet(d, NOW).listings[0]).toMatchObject({
      legacyId: 'ann:100', title: 'Villa à vendre', city: 'Cotonou', country: 'Bénin', propertyType: 'VILLA',
      transactionType: 'VENTE', price: 50000000, status: 'VERIFIED', landmark: 'Fidjrossè — Pharmacie X',
      surfaceM2: 300, bedrooms: 4, bathrooms: 2, kitchens: 1, viewCount: 15,
    });
  });

  it('forces DRAFT when hidden, unpriced or untyped', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [
      ann({ idannonce: 1, confid: 0 }), ann({ idannonce: 2, prix: '2.02' }),
      ann({ idannonce: 3, type: 'undefined' }), ann({ idannonce: 4, idtype: 0 }),
    ];
    const ls = buildImportSet(d, NOW).listings;
    expect(ls.map((l) => l.status)).toEqual(['DRAFT', 'DRAFT', 'DRAFT', 'DRAFT']);
    expect(ls[1]?.price).toBe(0);
    expect(ls[2]?.transactionType).toBe('VENTE');
    expect(ls[3]?.propertyType).toBe('MAISON');
  });

  it('notes the land-title status for parcels', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [ann({ idannonce: 1, idtype: 13 }), ann({ idannonce: 2, idtype: 8 })];
    const ls = buildImportSet(d, NOW).listings;
    expect(ls[0]?.description).toBe('Belle villa\n\nTitre foncier : oui');
    expect(ls[1]?.description).toBe('Belle villa\n\nTitre foncier : non');
  });

  it('orders photos per listing and keeps a single primary', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblannonce = [ann({})];
    d.tblgalerie = [
      { idgal: 5, urltof: 'b.webp', etat: 0, idannonce: 100 },
      { idgal: 3, urltof: 'a.webp', etat: 1, idannonce: 100 },
      { idgal: 9, urltof: 'c.webp', etat: 1, idannonce: 100 },
      { idgal: 10, urltof: 'x.webp', etat: 1, idannonce: 999 }, // orphan listing
    ];
    const s = buildImportSet(d, NOW);
    expect(s.photos.map((p) => [p.legacyId, p.position, p.isPrimary])).toEqual([
      ['gal:3', 0, true], ['gal:5', 1, false], ['gal:9', 2, false],
    ]);
    expect(s.skipped.photosOrphan).toBe(1);
  });

  it('splits a sector alert into VENTE + LOCATION alerts with city names', () => {
    const d = base();
    d.tbldemarcheur = [dem({})];
    d.tblalertesecteur = [{
      idalerte: 20, ville: '1/41/', datesave: '2026-04-02 21:17:10', dateexpire: '2027-07-22 23:50:51',
      iddem: 1, tel_alerte: '+33745548695', mail_alerte: '', idpays: 1,
    }];
    const a = buildImportSet(d, NOW).alerts;
    expect(a.map((x) => x.legacyId)).toEqual(['alerte:20:VENTE', 'alerte:20:LOCATION']);
    expect(a[0]).toMatchObject({ country: 'Bénin', cities: ['Cotonou'], notifWhatsapp: true, notifEmail: false, active: true });
  });

  it('sums wallet balances onto the kept agent', () => {
    const d = base();
    d.tbldemarcheur = [dem({ iddem: 1, etat: '0' }), dem({ iddem: 2 })];
    d.tblportefeuille = [{ iddem: 1, solde: 3 }, { iddem: 2, solde: 4 }, { iddem: 2, solde: 0 }];
    expect(buildImportSet(d, NOW).wallets).toEqual([{ ownerLegacyId: 'dem:2', balance: 7 }]);
  });

  it('maps public requests and closes the stale ones', () => {
    const d = base();
    d.tbldemandes = [
      { iddemandes: 18, idpays: 2, idville: 41, idtype: 4, action: 'louer', note: 'Appart', datesave: '2026-09-20 17:12:54', bmin: 50000, bmax: 60000, teldemande: '+22899163304', maildemande: 'h@x.com', chambre: 2, salon: 1, superficie: 0 },
      { iddemandes: 19, idpays: 2, idville: 41, idtype: 4, action: 'louer', note: '', datesave: '2026-01-01 00:00:00', bmin: 0, bmax: 0, teldemande: '', maildemande: '', chambre: 0, salon: 0, superficie: 0 },
    ];
    const r = buildImportSet(d, NOW).requests;
    expect(r[0]).toMatchObject({ legacyId: 'demande:18', transactionType: 'LOCATION', propertyType: 'APPARTEMENT', country: 'Togo', city: 'Lomé', bedrooms: '2 chambres', salons: '1 salon', budgetMin: 50000, budgetMax: 60000, status: 'EN_ATTENTE' });
    expect(r[1]?.status).toBe('CLOTUREE');
  });
});
```

- [ ] **Step 6 : Lancer → FAIL.**

- [ ] **Step 7 : Implémenter `build.ts`**

```ts
// Turns parsed legacy rows into a typed ImportSet. Pure: every business rule
// of the legacy import (dedup, status, re-pointing) lives here so it is
// unit-testable without a database.
import type { SqlRow } from './parse-dump';
import {
  COUNTRY_BY_CODE, COUNTRY_BY_ID, DIAL_BY_COUNTRY, int, mapPropertyType, mapRequestTransaction,
  mapTransactionType, normalizeEmail, normalizePhone, parseLegacyDate, parsePrice, str,
} from './mappers';
import { PROPERTY_TYPE_LABEL } from '../../src/lib/listings';

export const LEGACY_TABLES: ReadonlySet<string> = new Set([
  'tbldemarcheur', 'tblclient', 'tblannonce', 'tblgalerie', 'tblville', 'tblannonce_vu',
  'tblalertesecteur', 'tbldemandes', 'tblportefeuille',
]);

const STALE_REQUEST_MS = 90 * 24 * 3600 * 1000;

export interface UserRecord { legacyId: string; email: string; phone: string | null; name: string | null; bio: string | null; country: string | null; accountType: 'OWNER_AGENT' | 'TENANT_BUYER'; emailVerifiedAt: Date | null; createdAt: Date; }
export interface ListingRecord { legacyId: string; ownerLegacyId: string; title: string; city: string; country: string; propertyType: string; transactionType: string; price: number; status: 'VERIFIED' | 'DRAFT'; description: string | null; landmark: string | null; surfaceM2: number | null; bedrooms: number | null; bathrooms: number | null; kitchens: number | null; viewCount: number; createdAt: Date; }
export interface PhotoRecord { legacyId: string; listingLegacyId: string; legacyListingId: number; idgal: number; filename: string; isPrimary: boolean; position: number; }
export interface AlertRecord { legacyId: string; ownerLegacyId: string; name: string; transactionType: 'VENTE' | 'LOCATION'; propertyTypes: string[]; country: string; cities: string[]; notifWhatsapp: boolean; notifEmail: boolean; active: boolean; createdAt: Date; }
export interface RequestRecord { legacyId: string; transactionType: string; propertyType: string; country: string; city: string; bedrooms: string | null; salons: string | null; surfaceM2: number | null; budgetMin: number | null; budgetMax: number | null; clientPhone: string; clientEmail: string | null; notes: string | null; status: 'EN_ATTENTE' | 'CLOTUREE'; createdAt: Date; }
export interface WalletRecord { ownerLegacyId: string; balance: number; }
export interface ImportSet { users: UserRecord[]; listings: ListingRecord[]; photos: PhotoRecord[]; alerts: AlertRecord[]; requests: RequestRecord[]; wallets: WalletRecord[]; skipped: Record<string, number>; }

const fullName = (r: SqlRow): string | null => [str(r.prenom), str(r.nom)].filter(Boolean).join(' ') || null;
const plural = (n: number | null, word: string): string | null => (n ? `${n} ${word}${n > 1 ? 's' : ''}` : null);

export function buildImportSet(d: Record<string, SqlRow[]>, now: Date = new Date()): ImportSet {
  const rows = (t: string): SqlRow[] => d[t] ?? [];
  const skipped: Record<string, number> = {};
  const skip = (k: string): void => { skipped[k] = (skipped[k] ?? 0) + 1; };

  // ── Agents: group by email, keep etat='1' first then most recent ──────────
  const agents = [...rows('tbldemarcheur')].sort((a, b) => {
    const act = Number(str(b.etat) === '1') - Number(str(a.etat) === '1');
    return act !== 0 ? act : str(b.datesave).localeCompare(str(a.datesave));
  });
  const keptByEmail = new Map<string, number>();
  const ownerOf = new Map<number, string>(); // legacy iddem → kept user legacyId
  const usedPhones = new Set<string>();
  const users: UserRecord[] = [];

  for (const r of agents) {
    const iddem = Number(r.iddem);
    const email = normalizeEmail(r.mail);
    const kept = email ? keptByEmail.get(email) : undefined;
    if (kept !== undefined) { ownerOf.set(iddem, `dem:${kept}`); skip('agentsMerged'); continue; }
    if (email) keptByEmail.set(email, iddem);
    ownerOf.set(iddem, `dem:${iddem}`);
    const country = COUNTRY_BY_CODE[str(r.codepays)] ?? null;
    let phone = normalizePhone(r.tel, country ? DIAL_BY_COUNTRY[country] : null);
    if (phone && usedPhones.has(phone)) { phone = null; skip('phonesDuplicated'); }
    if (phone) usedPhones.add(phone);
    const verified = email !== null && /^\d+$/.test(str(r.etat));
    const createdAt = parseLegacyDate(r.datesave) ?? now;
    users.push({
      legacyId: `dem:${iddem}`, email: email ?? `legacy-dem-${iddem}@import.habitat-afrik.invalid`, phone,
      name: fullName(r), bio: str(r.apropos) || null, country, accountType: 'OWNER_AGENT',
      emailVerifiedAt: verified ? createdAt : null, createdAt,
    });
  }
  // Order users by legacy id so output is stable across runs.
  users.sort((a, b) => Number(a.legacyId.slice(4)) - Number(b.legacyId.slice(4)));

  // ── Clients: valid email not already taken ────────────────────────────────
  const takenEmails = new Set(users.map((u) => u.email));
  for (const r of rows('tblclient')) {
    const email = normalizeEmail(r.mail);
    if (!email || takenEmails.has(email)) { skip('clientsWithoutUsableEmail'); continue; }
    takenEmails.add(email);
    const createdAt = parseLegacyDate(r.datesave) ?? now;
    users.push({
      legacyId: `cli:${Number(r.idcli)}`, email, phone: null, name: fullName(r), bio: str(r.apropos) || null,
      country: null, accountType: 'TENANT_BUYER', emailVerifiedAt: createdAt, createdAt,
    });
  }

  // ── Listings ──────────────────────────────────────────────────────────────
  const villes = new Map(rows('tblville').map((v) => [Number(v.idville), v]));
  const views = new Map<number, number>();
  for (const v of rows('tblannonce_vu')) {
    const id = Number(v.idannonce);
    views.set(id, (views.get(id) ?? 0) + (Number(v.nbrevu) || 0));
  }
  const listings: ListingRecord[] = [];
  const listingIds = new Set<number>();
  for (const r of rows('tblannonce')) {
    const id = Number(r.idannonce);
    const owner = ownerOf.get(Number(r.iddem));
    const ville = villes.get(Number(r.idville));
    const country = ville ? COUNTRY_BY_ID[Number(ville.idpays)] : undefined;
    if (!owner || !ville || !country) { skip('listingsWithoutOwnerOrCity'); continue; }
    const price = parsePrice(r.prix);
    const propertyType = mapPropertyType(r.idtype);
    const transactionType = mapTransactionType(r.type);
    const publishable = Number(r.confid) === 1 && price !== null && propertyType !== null && transactionType !== null;
    const idtype = Number(r.idtype);
    const titleNote = idtype === 13 ? 'Titre foncier : oui' : idtype === 8 ? 'Titre foncier : non' : null;
    const description = [str(r.description), titleNote].filter(Boolean).join('\n\n') || null;
    listingIds.add(id);
    listings.push({
      legacyId: `ann:${id}`, ownerLegacyId: owner, title: str(r.titre) || 'Annonce', city: str(ville.libville), country,
      propertyType: propertyType ?? 'MAISON', transactionType: transactionType ?? 'VENTE', price: price ?? 0,
      status: publishable ? 'VERIFIED' : 'DRAFT', description,
      landmark: [str(r.quartier), str(r.repere)].filter(Boolean).join(' — ') || null,
      surfaceM2: int(r.superficie), bedrooms: int(r.chambre), bathrooms: int(r.douche), kitchens: int(r.cuisine),
      viewCount: views.get(id) ?? 0, createdAt: parseLegacyDate(r.datesave) ?? now,
    });
  }

  // ── Photos: per listing, ordered by idgal, first etat=1 is primary ────────
  const byListing = new Map<number, SqlRow[]>();
  for (const g of rows('tblgalerie')) {
    const lid = Number(g.idannonce);
    if (!listingIds.has(lid)) { skip('photosOrphan'); continue; }
    if (!str(g.urltof)) { skip('photosWithoutFile'); continue; }
    (byListing.get(lid) ?? byListing.set(lid, []).get(lid)!).push(g);
  }
  const photos: PhotoRecord[] = [];
  for (const [lid, gs] of [...byListing].sort((a, b) => a[0] - b[0])) {
    gs.sort((a, b) => Number(a.idgal) - Number(b.idgal));
    const primary = gs.find((g) => Number(g.etat) === 1) ?? gs[0];
    gs.forEach((g, position) => photos.push({
      legacyId: `gal:${Number(g.idgal)}`, listingLegacyId: `ann:${lid}`, legacyListingId: lid, idgal: Number(g.idgal),
      filename: str(g.urltof), isPrimary: g === primary, position,
    }));
  }

  // ── Sector alerts ────────────────────────────────────────────────────────
  const allTypes = Object.keys(PROPERTY_TYPE_LABEL);
  const alerts: AlertRecord[] = [];
  for (const r of rows('tblalertesecteur')) {
    const owner = ownerOf.get(Number(r.iddem));
    const idpays = Number(r.idpays);
    const country = COUNTRY_BY_ID[idpays];
    if (!owner || !country) { skip('alertsWithoutOwnerOrCountry'); continue; }
    const cities = str(r.ville).split('/').map(Number)
      .map((id) => villes.get(id))
      .filter((v): v is SqlRow => v !== undefined && Number(v.idpays) === idpays)
      .map((v) => str(v.libville));
    const expires = parseLegacyDate(r.dateexpire);
    for (const tx of ['VENTE', 'LOCATION'] as const) {
      alerts.push({
        legacyId: `alerte:${Number(r.idalerte)}:${tx}`, ownerLegacyId: owner,
        name: `Alerte secteur — ${tx === 'VENTE' ? 'Vente' : 'Location'}`, transactionType: tx,
        propertyTypes: allTypes, country, cities, notifWhatsapp: str(r.tel_alerte) !== '',
        notifEmail: normalizeEmail(r.mail_alerte) !== null, active: expires !== null && expires > now,
        createdAt: parseLegacyDate(r.datesave) ?? now,
      });
    }
  }

  // ── Public property requests ─────────────────────────────────────────────
  const requests: RequestRecord[] = [];
  for (const r of rows('tbldemandes')) {
    const transactionType = mapRequestTransaction(r.action);
    const propertyType = mapPropertyType(r.idtype);
    const ville = villes.get(Number(r.idville));
    const country = COUNTRY_BY_ID[Number(r.idpays)];
    if (!transactionType || !propertyType || !ville || !country) { skip('requestsUnmappable'); continue; }
    const createdAt = parseLegacyDate(r.datesave) ?? now;
    requests.push({
      legacyId: `demande:${Number(r.iddemandes)}`, transactionType, propertyType, country, city: str(ville.libville),
      bedrooms: plural(int(r.chambre), 'chambre'), salons: plural(int(r.salon), 'salon'), surfaceM2: int(r.superficie),
      budgetMin: int(r.bmin), budgetMax: int(r.bmax),
      clientPhone: normalizePhone(r.teldemande, DIAL_BY_COUNTRY[country]) ?? '',
      clientEmail: normalizeEmail(r.maildemande), notes: str(r.note) || null,
      status: now.getTime() - createdAt.getTime() > STALE_REQUEST_MS ? 'CLOTUREE' : 'EN_ATTENTE', createdAt,
    });
  }

  // ── Token wallets ────────────────────────────────────────────────────────
  const balances = new Map<string, number>();
  for (const r of rows('tblportefeuille')) {
    const owner = ownerOf.get(Number(r.iddem));
    const solde = int(r.solde);
    if (owner && solde) balances.set(owner, (balances.get(owner) ?? 0) + solde);
  }
  const wallets = [...balances].map(([ownerLegacyId, balance]) => ({ ownerLegacyId, balance }));

  return { users, listings, photos, alerts, requests, wallets, skipped };
}
```

- [ ] **Step 8 : Lancer → PASS** (`pnpm --filter frontend exec vitest run scripts/legacy-import/`). Puis `pnpm typecheck` (attention `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`).

- [ ] **Step 9 : Commit**

```bash
git add frontend/scripts/legacy-import/mappers.ts frontend/scripts/legacy-import/mappers.test.ts frontend/scripts/legacy-import/build.ts frontend/scripts/legacy-import/build.test.ts
git commit -m "feat(import): map legacy rows to an import set (users, listings, photos, alerts, requests, wallets)"
```

---

### Task 4 : Écriture Prisma idempotente

**Files:**
- Create: `frontend/scripts/legacy-import/write.ts`
- Test: `frontend/scripts/legacy-import/write.test.ts`

**Interfaces:**
- Consumes : `ImportSet`, `UserRecord` (Task 3) ; champs `legacyId` (Task 1).
- Produces :
  ```ts
  export type UserAction = { kind: 'update'; id: string } | { kind: 'link'; id: string } | { kind: 'create' };
  export function resolveUserAction(byLegacy: { id: string } | null, byEmail: { id: string; legacyId: string | null } | null): UserAction;
  export interface WriteReport { users: { created: number; updated: number; linked: number; conflicts: number }; listings: number; alerts: number; requests: number; wallets: number; }
  export async function writeImportSet(prisma: PrismaClient, set: ImportSet, log?: (msg: string) => void): Promise<{ report: WriteReport; userIdByLegacy: Map<string, string>; listingIdByLegacy: Map<string, string> }>;
  ```

Règles :
- `update` (déjà importé) : met à jour `name`, `bio`, `country`, `accountType`, `phone` seulement — **jamais** `passwordHash`, `email`, `emailVerifiedAt`, `role`, `status`.
- `link` (e-mail déjà présent sur la refonte, sans `legacyId`) : pose seulement `legacyId` (+ `phone` si le compte n'en a pas). Rien d'autre.
- `create` : `passwordHash: null`.
- e-mail présent mais déjà rattaché à un **autre** `legacyId` → `conflicts++`, user ignoré (log).
- Téléphone déjà pris par un autre user → on écrit `phone: null`.
- Listings/alerts/requests : `upsert` sur `legacyId`. En `update`, on ne rétrograde pas un statut modifié depuis sur la refonte : on ne réécrit `status` que si le listing est encore `VERIFIED`/`DRAFT`.
- Wallets : si une `TokenTransaction` de type `BONUS` avec la description `LEGACY_WALLET_DESC` existe déjà pour ce user → rien. Sinon, dans une transaction : upsert `TokenWallet` (`balance: { increment }`) + `TokenTransaction` (`balanceAfter`).

- [ ] **Step 1 : Test de `resolveUserAction`**

```ts
import { describe, expect, it } from 'vitest';
import { resolveUserAction } from './write';

describe('resolveUserAction', () => {
  it('updates a user already imported', () =>
    expect(resolveUserAction({ id: 'u1' }, { id: 'u1', legacyId: 'dem:1' })).toEqual({ kind: 'update', id: 'u1' }));
  it('links an existing account that signed up on the new site with the same email', () =>
    expect(resolveUserAction(null, { id: 'u2', legacyId: null })).toEqual({ kind: 'link', id: 'u2' }));
  it('creates when nothing matches', () => expect(resolveUserAction(null, null)).toEqual({ kind: 'create' }));
  it('refuses to steal an email already linked to another legacy account', () =>
    expect(() => resolveUserAction(null, { id: 'u3', legacyId: 'dem:9' })).toThrow(/already linked/));
});
```

- [ ] **Step 2 : Lancer → FAIL.**

- [ ] **Step 3 : Implémenter `write.ts`**

```ts
// Idempotent Prisma writer for the legacy import. Every row is keyed by
// `legacyId`, so re-running with a fresher dump updates in place. Never
// touches credentials: imported users get passwordHash=null and must use
// "Mot de passe oublié" (decision recorded in the plan).
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ImportSet, UserRecord } from './build';

export const LEGACY_WALLET_DESC = "Solde reporté de l'ancien site";

export type UserAction = { kind: 'update'; id: string } | { kind: 'link'; id: string } | { kind: 'create' };

export function resolveUserAction(
  byLegacy: { id: string } | null,
  byEmail: { id: string; legacyId: string | null } | null,
): UserAction {
  if (byLegacy) return { kind: 'update', id: byLegacy.id };
  if (!byEmail) return { kind: 'create' };
  if (byEmail.legacyId) throw new Error(`email already linked to ${byEmail.legacyId}`);
  return { kind: 'link', id: byEmail.id };
}

export interface WriteReport {
  users: { created: number; updated: number; linked: number; conflicts: number };
  listings: number;
  alerts: number;
  requests: number;
  wallets: number;
}

async function freePhone(prisma: PrismaClient, phone: string | null, selfId: string | null): Promise<string | null> {
  if (!phone) return null;
  const owner = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  return !owner || owner.id === selfId ? phone : null;
}

async function writeUser(prisma: PrismaClient, u: UserRecord, report: WriteReport, log: (m: string) => void): Promise<string | null> {
  const byLegacy = await prisma.user.findUnique({ where: { legacyId: u.legacyId }, select: { id: true } });
  const byEmail = byLegacy ? null : await prisma.user.findUnique({ where: { email: u.email }, select: { id: true, legacyId: true, phone: true } });
  let action: UserAction;
  try {
    action = resolveUserAction(byLegacy, byEmail);
  } catch (err) {
    report.users.conflicts++;
    log(`⚠ ${u.legacyId} ignoré : ${(err as Error).message}`);
    return null;
  }
  if (action.kind === 'update') {
    await prisma.user.update({
      where: { id: action.id },
      data: { name: u.name, bio: u.bio, country: u.country, accountType: u.accountType, phone: await freePhone(prisma, u.phone, action.id) },
    });
    report.users.updated++;
    return action.id;
  }
  if (action.kind === 'link') {
    const data: Prisma.UserUpdateInput = { legacyId: u.legacyId };
    if (!byEmail?.phone) data.phone = await freePhone(prisma, u.phone, action.id);
    await prisma.user.update({ where: { id: action.id }, data });
    report.users.linked++;
    return action.id;
  }
  const created = await prisma.user.create({
    data: {
      legacyId: u.legacyId, email: u.email, phone: await freePhone(prisma, u.phone, null), name: u.name, bio: u.bio,
      country: u.country, accountType: u.accountType, passwordHash: null, emailVerifiedAt: u.emailVerifiedAt,
      createdAt: u.createdAt,
    },
    select: { id: true },
  });
  report.users.created++;
  return created.id;
}

export async function writeImportSet(
  prisma: PrismaClient,
  set: ImportSet,
  log: (msg: string) => void = console.log,
): Promise<{ report: WriteReport; userIdByLegacy: Map<string, string>; listingIdByLegacy: Map<string, string> }> {
  const report: WriteReport = { users: { created: 0, updated: 0, linked: 0, conflicts: 0 }, listings: 0, alerts: 0, requests: 0, wallets: 0 };
  const userIdByLegacy = new Map<string, string>();
  const listingIdByLegacy = new Map<string, string>();

  for (const [i, u] of set.users.entries()) {
    const id = await writeUser(prisma, u, report, log);
    if (id) userIdByLegacy.set(u.legacyId, id);
    if ((i + 1) % 250 === 0) log(`  users ${i + 1}/${set.users.length}`);
  }

  for (const [i, l] of set.listings.entries()) {
    const userId = userIdByLegacy.get(l.ownerLegacyId);
    if (!userId) continue;
    const { legacyId, ownerLegacyId: _owner, status, ...fields } = l;
    const existing = await prisma.listing.findUnique({ where: { legacyId }, select: { id: true, status: true } });
    const keepStatus = existing && !['VERIFIED', 'DRAFT'].includes(existing.status);
    const row = existing
      ? await prisma.listing.update({ where: { id: existing.id }, data: { ...fields, userId, ...(keepStatus ? {} : { status }) }, select: { id: true } })
      : await prisma.listing.create({ data: { ...fields, legacyId, userId, status }, select: { id: true } });
    listingIdByLegacy.set(legacyId, row.id);
    report.listings++;
    if ((i + 1) % 500 === 0) log(`  listings ${i + 1}/${set.listings.length}`);
  }

  for (const a of set.alerts) {
    const userId = userIdByLegacy.get(a.ownerLegacyId);
    if (!userId) continue;
    const { legacyId, ownerLegacyId: _owner, ...fields } = a;
    await prisma.alert.upsert({ where: { legacyId }, create: { ...fields, legacyId, userId }, update: { ...fields, userId } });
    report.alerts++;
  }

  for (const r of set.requests) {
    const { legacyId, ...fields } = r;
    const data = { ...fields, financing: 'Les deux', delay: 'Flexible', clientName: 'Visiteur (ancien site)', source: 'ancien-site' };
    await prisma.propertyRequest.upsert({ where: { legacyId }, create: { ...data, legacyId }, update: data });
    report.requests++;
  }

  for (const w of set.wallets) {
    const userId = userIdByLegacy.get(w.ownerLegacyId);
    if (!userId) continue;
    const done = await prisma.tokenTransaction.findFirst({ where: { userId, type: 'BONUS', description: LEGACY_WALLET_DESC }, select: { id: true } });
    if (done) continue;
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.tokenWallet.upsert({
        where: { userId }, create: { userId, balance: w.balance }, update: { balance: { increment: w.balance } },
      });
      await tx.tokenTransaction.create({
        data: { userId, type: 'BONUS', amount: w.balance, balanceAfter: wallet.balance, description: LEGACY_WALLET_DESC },
      });
    });
    report.wallets++;
  }

  return { report, userIdByLegacy, listingIdByLegacy };
}
```

- [ ] **Step 4 : Lancer → PASS**, puis `pnpm typecheck`. Si `exactOptionalPropertyTypes` refuse `phone: string | null` dans `UserUpdateInput`, c'est attendu qu'il l'accepte (`String?` → `string | null`) ; ne pas caster en `any`.

- [ ] **Step 5 : Commit**

```bash
git add frontend/scripts/legacy-import/write.ts frontend/scripts/legacy-import/write.test.ts
git commit -m "feat(import): idempotent Prisma writer keyed on legacyId"
```

---

### Task 5 : Envoi des photos vers R2

**Files:**
- Create: `frontend/scripts/legacy-import/photos.ts`
- Test: `frontend/scripts/legacy-import/photos.test.ts`

**Interfaces:**
- Consumes : `PhotoRecord` (Task 3), `listingIdByLegacy` (Task 4), `uploadBuffer(publicId, body, contentType): Promise<{ publicId: string; secureUrl: string; bytes: number }>` de `src/lib/server/upload/storage-client.ts`.
- Produces :
  ```ts
  export interface PhotoDeps {
    readFile: (filename: string) => Promise<Buffer | null>; // null = fichier absent
    upload: (publicId: string, body: Buffer, contentType: string) => Promise<{ publicId: string; secureUrl: string }>;
    existingLegacyIds: () => Promise<Set<string>>;
    save: (p: { legacyId: string; listingId: string; key: string; url: string; isPrimary: boolean; position: number }) => Promise<void>;
  }
  export interface PhotoReport { uploaded: number; alreadyDone: number; missingFile: number; noListing: number; failed: number; }
  export async function importPhotos(photos: PhotoRecord[], listingIdByLegacy: Map<string, string>, deps: PhotoDeps, opts?: { concurrency?: number; limit?: number; log?: (m: string) => void }): Promise<PhotoReport>;
  ```
  Reprise : les photos dont le `legacyId` existe déjà en base sont sautées → on peut couper et relancer.

- [ ] **Step 1 : Tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { PhotoRecord } from './build';
import { importPhotos, type PhotoDeps } from './photos';

const photo = (idgal: number, filename = `${idgal}.webp`): PhotoRecord => ({
  legacyId: `gal:${idgal}`, listingLegacyId: 'ann:100', legacyListingId: 100, idgal, filename, isPrimary: idgal === 1, position: idgal - 1,
});

function deps(over: Partial<PhotoDeps> = {}): PhotoDeps {
  return {
    readFile: vi.fn(async (f: string) => (f === 'missing.webp' ? null : Buffer.from('img'))),
    upload: vi.fn(async (publicId: string) => ({ publicId: `${publicId}.webp`, secureUrl: `https://cdn/${publicId}.webp` })),
    existingLegacyIds: vi.fn(async () => new Set(['gal:2'])),
    save: vi.fn(async () => undefined),
    ...over,
  };
}

describe('importPhotos', () => {
  const ids = new Map([['ann:100', 'L1']]);

  it('uploads under a legacy-keyed path and saves the row', async () => {
    const d = deps();
    const r = await importPhotos([photo(1)], ids, d);
    expect(d.upload).toHaveBeenCalledWith('legacy/listings/100/1', expect.any(Buffer), 'image/webp');
    expect(d.save).toHaveBeenCalledWith({ legacyId: 'gal:1', listingId: 'L1', key: 'legacy/listings/100/1.webp', url: 'https://cdn/legacy/listings/100/1.webp', isPrimary: true, position: 0 });
    expect(r.uploaded).toBe(1);
  });

  it('skips already-imported photos, missing files and unknown listings without aborting', async () => {
    const d = deps();
    const orphan = { ...photo(4), listingLegacyId: 'ann:999' };
    const r = await importPhotos([photo(2), photo(3, 'missing.webp'), orphan, photo(5)], ids, d);
    expect(r).toEqual({ uploaded: 1, alreadyDone: 1, missingFile: 1, noListing: 1, failed: 0 });
  });

  it('counts an upload error as failed and keeps going', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error('R2 down')).mockResolvedValue({ publicId: 'k', secureUrl: 'u' });
    const r = await importPhotos([photo(1), photo(3)], ids, deps({ upload }));
    expect(r.failed).toBe(1);
    expect(r.uploaded).toBe(1);
  });

  it('honours limit', async () => {
    const d = deps({ existingLegacyIds: vi.fn(async () => new Set<string>()) });
    const r = await importPhotos([photo(1), photo(3), photo(5)], ids, d, { limit: 2 });
    expect(r.uploaded).toBe(2);
  });

  it('guesses the content type from the extension', async () => {
    const d = deps();
    await importPhotos([photo(7, 'x.JPG')], ids, d);
    expect(d.upload).toHaveBeenCalledWith('legacy/listings/100/7', expect.any(Buffer), 'image/jpeg');
  });
});
```

- [ ] **Step 2 : Lancer → FAIL.**

- [ ] **Step 3 : Implémenter**

```ts
// Uploads legacy listing photos to R2 and records ListingPhoto rows. Resumable:
// photos whose legacyId already exists are skipped, so the (long, ~1.8 GB)
// run can be interrupted and restarted. Object keys are derived from legacy
// ids, so a re-upload overwrites the same object instead of orphaning one.
import type { PhotoRecord } from './build';

export interface PhotoDeps {
  readFile: (filename: string) => Promise<Buffer | null>;
  upload: (publicId: string, body: Buffer, contentType: string) => Promise<{ publicId: string; secureUrl: string }>;
  existingLegacyIds: () => Promise<Set<string>>;
  save: (p: { legacyId: string; listingId: string; key: string; url: string; isPrimary: boolean; position: number }) => Promise<void>;
}

export interface PhotoReport { uploaded: number; alreadyDone: number; missingFile: number; noListing: number; failed: number; }

const MIME_BY_EXT: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

export async function importPhotos(
  photos: PhotoRecord[],
  listingIdByLegacy: Map<string, string>,
  deps: PhotoDeps,
  opts: { concurrency?: number; limit?: number; log?: (m: string) => void } = {},
): Promise<PhotoReport> {
  const { concurrency = 6, limit = Infinity, log = console.log } = opts;
  const report: PhotoReport = { uploaded: 0, alreadyDone: 0, missingFile: 0, noListing: 0, failed: 0 };
  const done = await deps.existingLegacyIds();

  const queue: { p: PhotoRecord; listingId: string }[] = [];
  for (const p of photos) {
    if (done.has(p.legacyId)) { report.alreadyDone++; continue; }
    const listingId = listingIdByLegacy.get(p.listingLegacyId);
    if (!listingId) { report.noListing++; continue; }
    queue.push({ p, listingId });
  }

  // Limit applied up-front: with concurrent workers a running counter would
  // let every worker grab an item before the first one increments it.
  const work = queue.slice(0, limit);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < work.length) {
      const item = work[next++];
      if (!item) return;
      const { p, listingId } = item;
      const body = await deps.readFile(p.filename);
      if (!body) { report.missingFile++; continue; }
      try {
        const ext = p.filename.split('.').pop()?.toLowerCase() ?? '';
        const res = await deps.upload(`legacy/listings/${p.legacyListingId}/${p.idgal}`, body, MIME_BY_EXT[ext] ?? 'application/octet-stream');
        await deps.save({ legacyId: p.legacyId, listingId, key: res.publicId, url: res.secureUrl, isPrimary: p.isPrimary, position: p.position });
        report.uploaded++;
        if (report.uploaded % 200 === 0) log(`  photos ${report.uploaded}/${work.length}`);
      } catch (err) {
        report.failed++;
        log(`⚠ ${p.legacyId} (${p.filename}) : ${(err as Error).message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return report;
}
```

- [ ] **Step 4 : Lancer → PASS.**

- [ ] **Step 5 : Commit**

```bash
git add frontend/scripts/legacy-import/photos.ts frontend/scripts/legacy-import/photos.test.ts
git commit -m "feat(import): resumable legacy photo upload to R2"
```

---

### Task 6 : CLI `pnpm import:legacy` + essai sur la base locale

**Files:**
- Create: `frontend/scripts/import-legacy.ts`
- Modify: `frontend/package.json` (bloc `scripts`), `package.json` racine (délégation, comme les autres scripts)

**Interfaces:**
- Consumes : `parseDump`, `LEGACY_TABLES`, `buildImportSet`, `writeImportSet`, `importPhotos`, `uploadBuffer`.
- Produces : commande
  `pnpm import:legacy --dump <fichier.sql> [--photos-dir <dossier>] [--photos-limit N] [--dry-run]`

- [ ] **Step 1 : Écrire le CLI**

```ts
// Imports the legacy PHP site (habitat-afrik.com) into this database.
// Usage:
//   pnpm import:legacy --dump "<…>/habiwpes_daa-immo-bdwafy.sql" [--dry-run]
//   pnpm import:legacy --dump <sql> --photos-dir "<…>/compte.habitat-afrik.com/img/annoncemodif" [--photos-limit 20]
// Re-runnable: everything is keyed on legacyId. Writes no notifications.
// See docs/superpowers/plans/2026-10-01-legacy-data-import.md.
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildImportSet, LEGACY_TABLES } from './legacy-import/build';
import { parseDump } from './legacy-import/parse-dump';
import { importPhotos } from './legacy-import/photos';
import { writeImportSet } from './legacy-import/write';
import { uploadBuffer } from '../src/lib/server/upload/storage-client';

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const dump = arg(args, '--dump');
  if (!dump) {
    console.error('Usage: pnpm import:legacy --dump <file.sql> [--photos-dir <dir>] [--photos-limit N] [--dry-run]');
    return 1;
  }
  const photosDir = arg(args, '--photos-dir');
  const photosLimit = Number(arg(args, '--photos-limit') ?? Infinity);
  const dryRun = args.includes('--dry-run');

  console.log(`Lecture de ${dump}…`);
  const set = buildImportSet(parseDump(await readFile(dump, 'utf8'), LEGACY_TABLES));
  const agents = set.users.filter((u) => u.accountType === 'OWNER_AGENT').length;
  console.table({
    agents, clients: set.users.length - agents, listings: set.listings.length,
    listingsVerified: set.listings.filter((l) => l.status === 'VERIFIED').length,
    photos: set.photos.length, alerts: set.alerts.length, requests: set.requests.length, wallets: set.wallets.length,
  });
  console.log('Ignorés :', set.skipped);
  if (dryRun) return 0;

  const prisma = new PrismaClient();
  try {
    const { report, listingIdByLegacy } = await writeImportSet(prisma, set);
    console.log('Base :', JSON.stringify(report));
    if (photosDir) {
      const photoReport = await importPhotos(set.photos, listingIdByLegacy, {
        readFile: async (f) => readFile(path.join(photosDir, path.basename(f))).catch(() => null),
        upload: (publicId, body, type) => uploadBuffer(publicId, body, type),
        existingLegacyIds: async () =>
          new Set((await prisma.listingPhoto.findMany({ where: { legacyId: { not: null } }, select: { legacyId: true } })).map((p) => p.legacyId as string)),
        save: async (p) => { await prisma.listingPhoto.create({ data: p }); },
      }, { limit: photosLimit });
      console.log('Photos :', JSON.stringify(photoReport));
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(1); });
}
```

Note : `path.basename(f)` empêche un `urltof` legacy contenant `../` de lire hors du dossier photos.

- [ ] **Step 2 : Ajouter les scripts**

Dans `frontend/package.json`, après `"drain:emails"` :
```json
    "import:legacy": "tsx --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/import-legacy.ts",
```
Dans le `package.json` racine, ajouter la délégation sur le modèle de `db:make-superadmin` :
```json
    "import:legacy": "pnpm --filter frontend run import:legacy",
```

- [ ] **Step 3 : Dry-run**

Run (racine) : `pnpm import:legacy --dump "D:/KEVIN/TAS SASS/habitatafrikoffi/ancien version habitatafrik/habiwpes_daa-immo-bdwafy.sql" --dry-run`
Expected (ordre de grandeur) : agents ≈ 1 090, clients ≈ 265, listings ≈ 4 456 dont VERIFIED ≈ 4 400, photos ≈ 20 000, alerts ≈ 260, requests ≤ 59, wallets ≈ 26. Si un compteur de `Ignorés` est anormal (ex. `listingsWithoutOwnerOrCity` > 50), s'arrêter et investiguer avant d'écrire.

- [ ] **Step 4 : Import réel sur la base LOCALE + 20 photos**

Run (PowerShell, racine) :
```powershell
$env:DATABASE_URL = "<URL localhost:5433>"; pnpm import:legacy --dump "<sql>" --photos-dir "D:/KEVIN/TAS SASS/habitatafrikoffi/ancien version habitatafrik/compte.habitat-afrik.com/img/annoncemodif" --photos-limit 20
```
Expected : `users.created` ≈ 1 355, `conflicts` = 0, `Photos : {"uploaded":20,…}`.

- [ ] **Step 5 : Vérifier l'idempotence (Review Focus 1)**

Relancer exactement la même commande. Expected : `users.created: 0`, `users.updated` = total précédent, aucun nouveau listing/alerte/demande (comparer `SELECT count(*)` avant/après dans `pnpm db:studio` ou psql), `wallets: 0`, `Photos : {"uploaded":20,"alreadyDone":20,…}`.

- [ ] **Step 6 : Contrôle visuel**

`pnpm dev`, ouvrir une annonce importée qui a des photos (prendre un id dans `ListingPhoto`) → la page publique s'affiche avec la photo R2, le prix, la ville. Ouvrir `/login` avec un e-mail importé → « identifiants invalides » (attendu), puis « Mot de passe oublié » → un code arrive dans les EmailJob/outbox.

- [ ] **Step 7 : Gate + commit**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
git add frontend/scripts/import-legacy.ts frontend/package.json package.json
git commit -m "feat(import): pnpm import:legacy CLI"
```

---

### Task 7 : Encart « ancien compte » sur /login

**Files:**
- Modify: `frontend/src/app/login/page.tsx` (sous le bloc d'en-tête, ~ligne 100)

- [ ] **Step 1 : Ajouter l'encart entre l'en-tête (`</div>` ligne 100) et `<form>`**

```tsx
      <div className="mb-6 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm text-neutral-700">
        Vous aviez un compte sur l&apos;ancien site Habitat-Afrik ? Vos annonces ont été
        conservées. Pour votre première connexion,{' '}
        <Link href="/forgot-password" className="font-medium text-brand underline">
          créez un nouveau mot de passe
        </Link>{' '}
        avec votre adresse e-mail.
      </div>
```

- [ ] **Step 2 : Vérifier** : `pnpm dev`, `/login` en 375 px et en desktop — l'encart ne casse pas la mise en page, le lien mène à `/forgot-password`. `pnpm lint && pnpm typecheck`.

- [ ] **Step 3 : Commit**

```bash
git add frontend/src/app/login/page.tsx
git commit -m "feat(login): tell legacy-site users to reset their password"
```

---

## Hors périmètre (suivi séparé)

- Import **en production** : après validation locale, refaire un dump frais le jour de la bascule, lancer `pnpm db:migrate:deploy` puis `pnpm import:legacy` avec l'URL N0C, photos sans `--photos-limit` (prévoir ~1–2 h).
- E-mail d'annonce aux anciens utilisateurs (Brevo) avec lien de réinitialisation.
- Redirections 301 des anciennes URL (`detail-annonce.php?…`, sous-domaines pays) → utilisent `Listing.legacyId`.
- Correction manuelle des 28 agents sans e-mail (back-office).
