// Uploads legacy listing photos to R2 and records ListingPhoto rows. Resumable:
// photos whose legacyId already exists are skipped, so the (long, ~1.8 GB)
// run can be interrupted and restarted. Object keys are derived from legacy
// ids, so a re-upload overwrites the same object instead of orphaning one.
import type { PhotoRecord } from './build';

export interface PhotoDeps {
  /** Resolves to null when the file is missing from the backup. */
  readFile: (filename: string) => Promise<Buffer | null>;
  upload: (
    publicId: string,
    body: Buffer,
    contentType: string,
  ) => Promise<{ publicId: string; secureUrl: string }>;
  existingLegacyIds: () => Promise<Set<string>>;
  save: (p: {
    legacyId: string;
    listingId: string;
    key: string;
    url: string;
    isPrimary: boolean;
    position: number;
  }) => Promise<void>;
}

export interface PhotoReport {
  uploaded: number;
  alreadyDone: number;
  missingFile: number;
  noListing: number;
  failed: number;
}

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
};

export async function importPhotos(
  photos: PhotoRecord[],
  listingIdByLegacy: Map<string, string>,
  deps: PhotoDeps,
  opts: { concurrency?: number; limit?: number; log?: (m: string) => void } = {},
): Promise<PhotoReport> {
  const { concurrency = 6, limit = Infinity, log = console.log } = opts;
  const report: PhotoReport = {
    uploaded: 0,
    alreadyDone: 0,
    missingFile: 0,
    noListing: 0,
    failed: 0,
  };
  const done = await deps.existingLegacyIds();

  const queue: { p: PhotoRecord; listingId: string }[] = [];
  for (const p of photos) {
    if (done.has(p.legacyId)) {
      report.alreadyDone++;
      continue;
    }
    const listingId = listingIdByLegacy.get(p.listingLegacyId);
    if (!listingId) {
      report.noListing++;
      continue;
    }
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
      if (!body) {
        report.missingFile++;
        continue;
      }
      try {
        const ext = p.filename.split('.').pop()?.toLowerCase() ?? '';
        const res = await deps.upload(
          `legacy/listings/${p.legacyListingId}/${p.idgal}`,
          body,
          MIME_BY_EXT[ext] ?? 'application/octet-stream',
        );
        await deps.save({
          legacyId: p.legacyId,
          listingId,
          key: res.publicId,
          url: res.secureUrl,
          isPrimary: p.isPrimary,
          position: p.position,
        });
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
