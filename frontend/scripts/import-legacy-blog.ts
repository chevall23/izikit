// Imports the 12 articles of the legacy blog (static PHP pages) as
// PUBLISHED BlogArticle rows, keeping their slugs so the old URLs can 301
// one-to-one to /blog/<slug>. Create-only: an existing slug is left as is.
// Usage:
//   pnpm import:legacy-blog --site-dir "<backup>/tg.habitat-afrik.com" \
//     --images-dir "<backup>/compte.habitat-afrik.com/img/blog" [--dry-run]
// Runs with `--conditions=react-server` (storage-client / sanitize import
// `server-only`).
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { uploadBuffer } from '../src/lib/server/upload/storage-client';
import { sanitizeArticleHtml } from '../src/lib/server/blog/sanitize';
import { computeReadTimeMinutes } from '../src/lib/server/blog/read-time';
import { articleSeoDescription } from '../src/lib/seo/blog';
import { LEGACY_ARTICLES, LEGACY_CATEGORIES, parseLegacyArticle } from './legacy-import/blog';

const AUTHOR = { name: 'Équipe Habitat-Afrik', role: 'Rédaction' };

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const siteDir = arg(args, '--site-dir');
  const imagesDir = arg(args, '--images-dir');
  const dryRun = args.includes('--dry-run');
  if (!siteDir || !imagesDir) {
    console.error('Usage: pnpm import:legacy-blog --site-dir <dir> --images-dir <dir> [--dry-run]');
    return 1;
  }

  const articles = await Promise.all(
    LEGACY_ARTICLES.map(async (ref) => {
      const parsed = parseLegacyArticle(
        await readFile(path.join(siteDir, `${ref.slug}.php`), 'utf8'),
      );
      const contentHtml = sanitizeArticleHtml(parsed.bodyHtml)
        .replace(/\s+/g, ' ')
        .replace(/<p>\s*<\/p>/g, '')
        .trim();
      // Two legacy pages have no meta description: use the opening text.
      const excerpt = parsed.description || articleSeoDescription({ excerpt: '', contentHtml });
      return { ref, parsed, title: ref.title ?? parsed.title, contentHtml, excerpt };
    }),
  );
  console.table(
    articles.map((a) => ({
      slug: a.ref.slug,
      title: a.title.slice(0, 50),
      cover: a.parsed.coverFile,
      chars: a.contentHtml.length,
    })),
  );
  if (dryRun) return 0;

  const prisma = new PrismaClient();
  try {
    const categoryId = new Map<string, string>();
    for (const [i, c] of LEGACY_CATEGORIES.entries()) {
      const existing = await prisma.blogCategory.findUnique({ where: { slug: c.slug } });
      const row = existing ?? (await prisma.blogCategory.create({ data: { ...c, position: i } }));
      categoryId.set(c.slug, row.id);
    }

    let created = 0;
    for (const a of articles) {
      if (await prisma.blogArticle.findUnique({ where: { slug: a.ref.slug } })) continue;

      let coverImageUrl: string | null = null;
      if (a.parsed.coverFile) {
        const file = path.join(imagesDir, path.basename(a.parsed.coverFile));
        const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
        const uploaded = await uploadBuffer(
          `legacy/blog/${a.ref.slug}`,
          await readFile(file),
          type,
        );
        coverImageUrl = uploaded.secureUrl;
      }

      await prisma.blogArticle.create({
        data: {
          slug: a.ref.slug,
          title: a.title,
          excerpt: a.excerpt,
          contentHtml: a.contentHtml,
          coverImageUrl,
          categoryId: categoryId.get(a.ref.category)!,
          tags: [],
          authorName: AUTHOR.name,
          authorRole: AUTHOR.role,
          status: 'PUBLISHED',
          readTimeMinutes: computeReadTimeMinutes(a.contentHtml),
          publishedAt: new Date(`${a.ref.publishedAt}T09:00:00Z`),
        },
      });
      created++;
      console.log(`+ ${a.ref.slug}`);
    }
    console.log(`Articles créés : ${created} / ${articles.length}`);
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
