'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { formatDate } from '@/lib/alerts';
import { cloudinaryOptimize } from '@/lib/listings';

interface ArticleDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string | null;
  tags: string[];
  author: { name: string; role: string | null; avatarUrl: string | null };
  category: { slug: string; label: string; colorKey: string };
  readTimeMinutes: number;
  publishedAt: string | null;
  viewCount: number;
}

const CATEGORY_COLOR_CLASSES: Record<string, string> = {
  brand: 'bg-brand/10 text-brand',
  green: 'bg-green-600/10 text-green-600',
  amber: 'bg-amber-500/10 text-amber-600',
  violet: 'bg-violet-500/10 text-violet-600',
  red: 'bg-red-500/10 text-red-600',
};

function categoryClasses(colorKey: string): string {
  return CATEGORY_COLOR_CLASSES[colorKey] ?? CATEGORY_COLOR_CLASSES['brand']!;
}

export default function BlogArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    api<ArticleDetail>(`/api/public/blog/articles/${slug}`)
      .then((res) => {
        if (cancelled) return;
        setArticle(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        }
        setArticle(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="bg-white text-neutral-900">
        <PublicNavbar active="blog" />
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-hidden />
        </div>
        <PublicFooter />
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="bg-white text-neutral-900">
        <PublicNavbar active="blog" />
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-lg font-bold">Article introuvable</p>
          <p className="max-w-[360px] text-sm text-gray-500">
            Cet article n&apos;existe pas ou n&apos;est plus disponible.
          </p>
          <Link href="/blog" className="mt-2 text-sm font-semibold text-brand">
            Retour au blog
          </Link>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="bg-white text-neutral-900">
      <PublicNavbar active="blog" />

      <div className="mx-auto max-w-[760px] px-4 py-10 lg:px-7 lg:py-14">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Retour au blog
        </Link>

        <span
          className={cn(
            'mb-4 inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap uppercase',
            categoryClasses(article.category.colorKey),
          )}
        >
          {article.category.label}
        </span>

        <h1 className="font-sora mb-4 text-[26px] leading-tight font-extrabold tracking-[-0.03em] lg:text-[38px]">
          {article.title}
        </h1>

        <div className="mb-7 flex flex-wrap items-center gap-3">
          {article.author.avatarUrl && (
            <img
              src={article.author.avatarUrl}
              alt={article.author.name}
              className="h-9 w-9 rounded-full object-cover"
            />
          )}
          <span className="text-sm font-semibold">{article.author.name}</span>
          {article.author.role && (
            <span className="text-xs text-gray-500">{article.author.role}</span>
          )}
          {article.publishedAt && (
            <span className="text-xs text-gray-500">{formatDate(article.publishedAt)}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" aria-hidden />
            {article.readTimeMinutes} min
          </span>
        </div>

        {article.coverImageUrl && (
          <img
            src={cloudinaryOptimize(article.coverImageUrl, 900)}
            alt={article.title}
            className="mb-8 w-full rounded-2xl object-cover"
          />
        )}

        <div
          className="prose prose-neutral max-w-none text-[15px] leading-relaxed"
          // contentHtml is sanitized server-side at write time (admin-only
          // write path, see lib/server/blog/sanitize.ts) — never re-sanitized
          // here, never populated from unmoderated user input.
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />

        {article.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2 border-t border-black/[0.06] pt-6">
            {article.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-black/[0.08] bg-gray-50 px-3 py-[5px] text-xs font-medium whitespace-nowrap text-gray-500"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <PublicFooter />
    </div>
  );
}
