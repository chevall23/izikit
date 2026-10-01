import { describe, expect, it, vi } from 'vitest';
import type { PhotoRecord } from './build';
import { importPhotos, type PhotoDeps } from './photos';

const photo = (idgal: number, filename = `${idgal}.webp`): PhotoRecord => ({
  legacyId: `gal:${idgal}`,
  listingLegacyId: 'ann:100',
  legacyListingId: 100,
  idgal,
  filename,
  isPrimary: idgal === 1,
  position: idgal - 1,
});

function deps(over: Partial<PhotoDeps> = {}): PhotoDeps {
  return {
    readFile: vi.fn(async (f: string) => (f === 'missing.webp' ? null : Buffer.from('img'))),
    upload: vi.fn(async (publicId: string) => ({
      publicId: `${publicId}.webp`,
      secureUrl: `https://cdn/${publicId}.webp`,
    })),
    existingLegacyIds: vi.fn(async () => new Set(['gal:2'])),
    save: vi.fn(async () => undefined),
    ...over,
  };
}

const silent = { log: () => undefined };

describe('importPhotos', () => {
  const ids = new Map([['ann:100', 'L1']]);

  it('uploads under a legacy-keyed path and saves the row', async () => {
    const d = deps();
    const r = await importPhotos([photo(1)], ids, d, silent);
    expect(d.upload).toHaveBeenCalledWith(
      'legacy/listings/100/1',
      expect.any(Buffer),
      'image/webp',
    );
    expect(d.save).toHaveBeenCalledWith({
      legacyId: 'gal:1',
      listingId: 'L1',
      key: 'legacy/listings/100/1.webp',
      url: 'https://cdn/legacy/listings/100/1.webp',
      isPrimary: true,
      position: 0,
    });
    expect(r.uploaded).toBe(1);
  });

  it('skips already-imported photos, missing files and unknown listings without aborting', async () => {
    const orphan = { ...photo(4), listingLegacyId: 'ann:999' };
    const r = await importPhotos(
      [photo(2), photo(3, 'missing.webp'), orphan, photo(5)],
      ids,
      deps(),
      silent,
    );
    expect(r).toEqual({ uploaded: 1, alreadyDone: 1, missingFile: 1, noListing: 1, failed: 0 });
  });

  it('counts an upload error as failed and keeps going', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('R2 down'))
      .mockResolvedValue({ publicId: 'k', secureUrl: 'u' });
    const r = await importPhotos([photo(1), photo(3)], ids, deps({ upload }), silent);
    expect(r.failed).toBe(1);
    expect(r.uploaded).toBe(1);
  });

  it('logs something useful for an error without a message', async () => {
    const lines: string[] = [];
    const err = Object.assign(new Error(''), { name: 'TimeoutError' });
    const upload = vi.fn().mockRejectedValue(err);
    await importPhotos([photo(1)], ids, deps({ upload }), { log: (m) => lines.push(m) });
    expect(lines.join('\n')).toContain('TimeoutError');
  });

  it('honours limit even with concurrent workers', async () => {
    const d = deps({ existingLegacyIds: vi.fn(async () => new Set<string>()) });
    const r = await importPhotos([photo(1), photo(3), photo(5)], ids, d, { ...silent, limit: 2 });
    expect(r.uploaded).toBe(2);
  });

  it('guesses the content type from the extension', async () => {
    const d = deps();
    await importPhotos([photo(7, 'x.JPG')], ids, d, silent);
    expect(d.upload).toHaveBeenCalledWith(
      'legacy/listings/100/7',
      expect.any(Buffer),
      'image/jpeg',
    );
  });
});
