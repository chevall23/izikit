// Imports the legacy PHP site (habitat-afrik.com) into this database.
// Usage:
//   pnpm import:legacy --dump "<…>/habiwpes_daa-immo-bdwafy.sql" [--dry-run]
//   pnpm import:legacy --dump <sql> --photos-dir "<…>/compte.habitat-afrik.com/img/annoncemodif" [--photos-limit 20]
// Re-runnable: everything is keyed on legacyId. Writes no notifications.
// Runs with `--conditions=react-server` so storage-client's `server-only`
// import resolves to its no-op build outside Next.
// See docs/superpowers/plans/2026-10-01-legacy-data-import.md.
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { uploadBuffer } from '../src/lib/server/upload/storage-client';
import { buildImportSet, LEGACY_TABLES } from './legacy-import/build';
import { parseDump } from './legacy-import/parse-dump';
import { importPhotos } from './legacy-import/photos';
import { writeImportSet } from './legacy-import/write';

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const dump = arg(args, '--dump');
  if (!dump) {
    console.error(
      'Usage: pnpm import:legacy --dump <file.sql> [--photos-dir <dir>] [--photos-limit N] [--dry-run]',
    );
    return 1;
  }
  const photosDir = arg(args, '--photos-dir');
  const photosLimit = Number(arg(args, '--photos-limit') ?? Infinity);
  const dryRun = args.includes('--dry-run');

  console.log(`Lecture de ${dump}…`);
  const set = buildImportSet(parseDump(await readFile(dump, 'utf8'), LEGACY_TABLES));
  const agents = set.users.filter((u) => u.accountType === 'OWNER_AGENT').length;
  console.table({
    agents,
    clients: set.users.length - agents,
    listings: set.listings.length,
    listingsVerified: set.listings.filter((l) => l.status === 'VERIFIED').length,
    photos: set.photos.length,
    alerts: set.alerts.length,
    requests: set.requests.length,
    wallets: set.wallets.length,
  });
  console.log('Ignorés :', set.skipped);
  if (dryRun) return 0;

  const prisma = new PrismaClient();
  try {
    const { report, listingIdByLegacy } = await writeImportSet(prisma, set);
    console.log('Base :', JSON.stringify(report));
    if (photosDir) {
      const photoReport = await importPhotos(
        set.photos,
        listingIdByLegacy,
        {
          // basename() keeps a legacy urltof containing "../" inside photosDir.
          readFile: async (f) => readFile(path.join(photosDir, path.basename(f))).catch(() => null),
          upload: (publicId, body, type) => uploadBuffer(publicId, body, type),
          existingLegacyIds: async () => {
            const rows = await prisma.listingPhoto.findMany({
              where: { legacyId: { not: null } },
              select: { legacyId: true },
            });
            return new Set(rows.flatMap((p) => (p.legacyId ? [p.legacyId] : [])));
          },
          save: async (p) => {
            await prisma.listingPhoto.create({ data: p });
          },
        },
        { limit: photosLimit },
      );
      console.log('Photos :', JSON.stringify(photoReport));
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
