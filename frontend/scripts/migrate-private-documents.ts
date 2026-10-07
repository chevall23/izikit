// Moves legal / KYC documents and listing documents uploaded before the
// private bucket existed from the PUBLIC R2 bucket to the PRIVATE one
// (R2_PRIVATE_BUCKET_NAME), then points their rows at it (`url =
// 'private:<key>'`) and deletes the public copy. Idempotent: rows already
// private are skipped. Dry run unless --apply is passed.
// Usage:
//   pnpm migrate:private-documents            # dry run: lists what would move
//   pnpm migrate:private-documents --apply    # copy → update row → delete public object
import { PrismaClient } from '@prisma/client';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const PRIVATE_URL_PREFIX = 'private:';

function env(name: string): string {
  const v = process.env[name] ?? '';
  if (!v) throw new Error(`${name} is required`);
  return v;
}

type Row = { id: string; key: string; url: string };

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const publicBucket = env('R2_BUCKET_NAME');
  const privateBucket = env('R2_PRIVATE_BUCKET_NAME');
  if (publicBucket === privateBucket) {
    throw new Error('R2_PRIVATE_BUCKET_NAME must differ from R2_BUCKET_NAME');
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    },
  });
  const prisma = new PrismaClient();

  const notPrivate = { NOT: { url: { startsWith: PRIVATE_URL_PREFIX } } };
  const select = { id: true, key: true, url: true } as const;
  const tables: {
    name: string;
    rows: Row[];
    update: (id: string, url: string) => Promise<unknown>;
  }[] = [
    {
      name: 'LegalDocument',
      rows: await prisma.legalDocument.findMany({ where: notPrivate, select }),
      update: (id, url) => prisma.legalDocument.update({ where: { id }, data: { url } }),
    },
    {
      name: 'ListingDocument',
      rows: await prisma.listingDocument.findMany({ where: notPrivate, select }),
      update: (id, url) => prisma.listingDocument.update({ where: { id }, data: { url } }),
    },
  ];

  let moved = 0;
  let failed = 0;
  for (const table of tables) {
    console.log(`${table.name}: ${table.rows.length} document(s) to move`);
    for (const row of table.rows) {
      if (!apply) {
        console.log(`  would move ${row.key}`);
        continue;
      }
      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: publicBucket, Key: row.key }));
        if (!obj.Body) throw new Error('empty body');
        await s3.send(
          new PutObjectCommand({
            Bucket: privateBucket,
            Key: row.key,
            Body: await obj.Body.transformToByteArray(),
            ContentType: obj.ContentType ?? 'application/octet-stream',
          }),
        );
        // Row first, delete last: a crash in between leaves a harmless
        // public duplicate, never a row pointing at a missing object.
        await table.update(row.id, `${PRIVATE_URL_PREFIX}${row.key}`);
        await s3.send(new DeleteObjectCommand({ Bucket: publicBucket, Key: row.key }));
        moved++;
        console.log(`  moved ${row.key}`);
      } catch (err) {
        failed++;
        console.error(`  FAILED ${row.key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  console.log(apply ? `Done: ${moved} moved, ${failed} failed.` : 'Dry run — re-run with --apply.');
  await prisma.$disconnect();
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
