// Blog index — the requested list page is rendered on the server so search
// engines get the H1 and a real link to every article (pagination and
// category tabs are crawlable links too); BlogClient takes over for
// filtering and search. Category views are noindex (they only re-sort the
// same articles); paginated pages keep a self canonical.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/site';
import { listBlogCategories, listBlogTags, searchPublicArticles } from '@/lib/server/public/blog';
import { BlogClient } from './BlogClient';
import { BLOG_PAGE_LIMIT } from './config';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}

function parseQuery(sp: Record<string, string | string[] | undefined>) {
  const page = Number.parseInt(first(sp.page), 10);
  return {
    categorySlug: first(sp.category),
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

const TITLE = 'Blog immobilier : conseils pour acheter, louer, investir';
const DESCRIPTION =
  "Titre foncier, investissement, location : nos guides pratiques pour réussir vos projets immobiliers au Bénin, au Togo, en Côte d'Ivoire et au Sénégal.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { categorySlug, page } = parseQuery(await searchParams);
  return pageMetadata({
    title: page > 1 ? `${TITLE} — page ${page}` : TITLE,
    description: DESCRIPTION,
    path: page > 1 && !categorySlug ? `/blog?page=${page}` : '/blog',
    absoluteTitle: true,
    noindex: Boolean(categorySlug),
  });
}

export default async function BlogPage({ searchParams }: Props) {
  const { categorySlug, page } = parseQuery(await searchParams);
  const listParams = new URLSearchParams({ page: String(page), limit: String(BLOG_PAGE_LIMIT) });
  if (categorySlug) listParams.set('category', categorySlug);

  const [articles, popular, categories, tags] = await Promise.all([
    searchPublicArticles(listParams).catch(() => null),
    searchPublicArticles(new URLSearchParams({ sort: 'popular', limit: '5' }))
      .then((r) => r.items)
      .catch(() => []),
    listBlogCategories().catch(() => []),
    listBlogTags().catch(() => []),
  ]);

  return <BlogClient initial={{ categorySlug, page, categories, tags, popular, articles }} />;
}
