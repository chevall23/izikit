// SEO helpers for blog articles (/blog/[slug]).
import { cleanText, truncate } from './text';

export interface ArticleSeoFields {
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string | null;
  author: { name: string; role?: string | null; avatarUrl?: string | null };
  category: { label: string };
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+([.,;:!?])/g, '$1');
}

export function articleSeoDescription(a: Pick<ArticleSeoFields, 'excerpt' | 'contentHtml'>) {
  const source = a.excerpt.trim() || htmlToText(a.contentHtml);
  return truncate(cleanText(source), 160);
}

/** Team / brand bylines ("Équipe Habitat-Afrik") are an Organization, anything else a Person. */
const ORGANIZATION_BYLINE = /équipe|equipe|rédaction|redaction|habitat[- ]?afrik/i;

function articleAuthor(a: ArticleSeoFields['author']) {
  if (ORGANIZATION_BYLINE.test(a.name)) return { '@type': 'Organization', name: a.name };
  return {
    '@type': 'Person',
    name: a.name,
    ...(a.role && { jobTitle: a.role }),
    ...(a.avatarUrl && { image: a.avatarUrl }),
  };
}

export function articleJsonLd(a: ArticleSeoFields, url: string, siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    description: articleSeoDescription(a),
    ...(a.coverImageUrl && { image: [a.coverImageUrl] }),
    ...(a.publishedAt && { datePublished: a.publishedAt }),
    dateModified: a.updatedAt,
    author: articleAuthor(a.author),
    publisher: { '@id': `${siteUrl}/#organization` },
    mainEntityOfPage: url,
    articleSection: a.category.label,
    ...(a.tags.length > 0 && { keywords: a.tags.join(', ') }),
    inLanguage: 'fr',
  };
}
