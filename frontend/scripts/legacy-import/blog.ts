// Legacy blog articles: static PHP pages on bj./tg.habitat-afrik.com
// (`<slug>.php`), cover images under compte.habitat-afrik.com/img/blog/.
// Pure parsing — the CLI (scripts/import-legacy-blog.ts) sanitizes, uploads
// covers and writes the rows.

export interface LegacyCategory {
  slug: string;
  label: string;
  colorKey: 'brand' | 'green' | 'amber' | 'violet' | 'red';
}

export const LEGACY_CATEGORIES: LegacyCategory[] = [
  { slug: 'conseils-demarches', label: 'Conseils & démarches', colorKey: 'brand' },
  { slug: 'investissement', label: 'Investissement', colorKey: 'green' },
  { slug: 'espace-agents', label: 'Espace agents', colorKey: 'violet' },
  { slug: 'maison-energie', label: 'Maison & énergie', colorKey: 'amber' },
  { slug: 'sejours', label: 'Séjours', colorKey: 'red' },
];

export interface LegacyArticleRef {
  slug: string;
  category: string;
  /** Publication date (the legacy page's file date). */
  publishedAt: string;
  /** Replaces the legacy H1 when it needs more than sentence-casing. */
  title?: string;
}

export const LEGACY_ARTICLES: LegacyArticleRef[] = [
  {
    slug: '4-regle-dor-pour-prendre-une-photo-dannonce-reussie',
    category: 'espace-agents',
    publishedAt: '2021-07-07',
    title: '4 règles d’or pour prendre une photo d’annonce réussie',
  },
  { slug: 'trouver-un-terrain-au-pays', category: 'conseils-demarches', publishedAt: '2021-07-07' },
  {
    slug: '7-conseils-pour-etre-un-bon-agent-immobilier',
    category: 'espace-agents',
    publishedAt: '2021-08-10',
  },
  {
    slug: '5-raisons-pour-mettre-votre-annonce-sur-habitat-afrik',
    category: 'espace-agents',
    publishedAt: '2021-09-06',
  },
  {
    slug: 'comment-avoir-son-titre-foncier-au-benin',
    category: 'conseils-demarches',
    publishedAt: '2021-10-04',
  },
  {
    slug: 'comment-realiser-des-economies-sur-votre-facture-electricite',
    category: 'maison-energie',
    publishedAt: '2021-11-29',
  },
  {
    slug: 'pourquoi-installer-des-panneaux-solaires-chez-vous',
    category: 'maison-energie',
    publishedAt: '2021-12-29',
  },
  {
    slug: 'difference-entre-un-architecte-et-un-architecte-interieur',
    category: 'conseils-demarches',
    publishedAt: '2022-02-18',
  },
  {
    slug: 'ou-investir-dans-immobilier-au-togo',
    category: 'investissement',
    publishedAt: '2022-03-17',
  },
  {
    slug: 'ou-investir-dans-immobilier-au-benin',
    category: 'investissement',
    publishedAt: '2022-04-25',
  },
  {
    slug: 'louer-un-appartement-de-vacance-a-lome',
    category: 'sejours',
    publishedAt: '2023-06-07',
  },
  {
    slug: 'quel-hebergement-choisir-pour-votre-sejour-a-cotonou',
    category: 'sejours',
    publishedAt: '2024-06-18',
  },
];

const LEGACY_SLUGS = new Set(LEGACY_ARTICLES.map((a) => a.slug));

export interface ParsedLegacyArticle {
  title: string;
  description: string;
  coverFile: string | null;
  /** Article body, unsanitized (the CLI runs sanitizeArticleHtml on it). */
  bodyHtml: string;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeTitle(raw: string): string {
  let title = collapse(raw.replace(/<[^>]+>/g, ''));
  if (title === title.toUpperCase()) title = title.charAt(0) + title.slice(1).toLowerCase();
  return title.replace(/habitat-afrik/gi, 'Habitat-Afrik');
}

export function parseLegacyArticle(php: string): ParsedLegacyArticle {
  const h1 = php.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
  const description = php.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  const coverFile = php.match(/blog-photo">\s*<img src="[^"]*?img\/blog\/([^"]+)"/)?.[1] ?? null;

  const start = php.indexOf('<div class="detail">');
  const end = php.indexOf('<div class="row clearfix">', start);
  let body =
    start >= 0 ? php.slice(start + '<div class="detail">'.length, end >= 0 ? end : undefined) : '';
  body = body
    .replace(/<\?php[\s\S]*?\?>/g, '')
    // Paragraph breaks were typed as "<br> <br>" inside one <p>.
    .replace(/(?:<br\s*\/?>\s*){2,}/g, '</p><p>')
    .replace(
      /https?:\/\/(?:[a-z]+\.)?habitat-afrik\.com\/([a-z0-9-]+)\.php/gi,
      (url, slug: string) => (LEGACY_SLUGS.has(slug) ? `/blog/${slug}` : url),
    )
    .trim();

  return {
    title: normalizeTitle(h1),
    description: collapse(description),
    coverFile,
    bodyHtml: body,
  };
}
