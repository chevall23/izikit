// Blog article — rendered on the server so search engines get the full text,
// metadata and BlogPosting structured data.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getPublishedArticle } from '@/lib/server/public/blog';
import { articleJsonLd, articleSeoDescription } from '@/lib/seo/blog';
import { SITE_URL, absoluteUrl, pageMetadata } from '@/lib/seo/site';
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { BlogArticleClient } from './BlogArticleClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

const loadArticle = cache((slug: string) => getPublishedArticle(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await loadArticle((await params).slug);
  if (!article) return { title: 'Article introuvable', robots: { index: false } };
  return pageMetadata({
    title: article.title,
    description: articleSeoDescription(article),
    path: `/blog/${article.slug}`,
    type: 'article',
    ...(article.coverImageUrl && { image: { url: article.coverImageUrl, alt: article.title } }),
  });
}

export default async function BlogArticlePage({ params }: Props) {
  const article = await loadArticle((await params).slug);
  if (!article) notFound();

  const url = absoluteUrl(`/blog/${article.slug}`);
  return (
    <>
      <JsonLd data={articleJsonLd(article, url, SITE_URL)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Accueil', url: absoluteUrl('/') },
          { name: 'Blog', url: absoluteUrl('/blog') },
          { name: article.title, url },
        ])}
      />
      <BlogArticleClient initialArticle={article} />
    </>
  );
}
