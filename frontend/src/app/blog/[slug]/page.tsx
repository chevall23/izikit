'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Eye,
  Flame,
  Home,
  Link2,
  List,
  Loader2,
  Mail,
  Send,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { formatDate } from '@/lib/alerts';
import { cloudinaryOptimize } from '@/lib/listings';

interface ArticleAuthor {
  name: string;
  role: string | null;
  avatarUrl: string | null;
}

interface ArticleCategory {
  slug: string;
  label: string;
  colorKey: string;
}

interface ArticleDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string | null;
  tags: string[];
  author: ArticleAuthor;
  category: ArticleCategory;
  readTimeMinutes: number;
  publishedAt: string | null;
  viewCount: number;
}

interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  category: ArticleCategory;
  readTimeMinutes: number;
  publishedAt: string | null;
  viewCount: number;
}

interface ArticlesResponse {
  items: ArticleListItem[];
}

interface TocEntry {
  id: string;
  text: string;
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

function slugifyHeading(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base ? `${base}-${index}` : `section-${index}`;
}

export default function BlogArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [related, setRelated] = useState<ArticleListItem[]>([]);
  const [popular, setPopular] = useState<ArticleListItem[]>([]);

  const [toc, setToc] = useState<TocEntry[]>([]);
  const [activeToc, setActiveToc] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [copied, setCopied] = useState(false);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterState, setNewsletterState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setToc([]);
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

  useEffect(() => {
    api<ArticlesResponse>('/api/public/blog/articles?sort=popular&limit=4')
      .then((res) => setPopular(res.items.filter((a) => a.slug !== slug)))
      .catch(() => setPopular([]));
  }, [slug]);

  useEffect(() => {
    if (!article) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('category', article.category.slug);
    params.set('limit', '4');
    api<ArticlesResponse>(`/api/public/blog/articles?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setRelated(res.items.filter((a) => a.id !== article.id).slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setRelated([]);
      });
    return () => {
      cancelled = true;
    };
  }, [article]);

  // Build the table of contents from the sanitized content's real <h2>
  // headings (server-sanitized HTML has no ids) and track which section is
  // in view — this is DOM-derived, it never mutates contentHtml itself.
  useEffect(() => {
    if (!article || !contentRef.current) return;
    const headings = Array.from(contentRef.current.querySelectorAll('h2'));
    if (headings.length === 0) {
      setToc([]);
      return;
    }
    const entries: TocEntry[] = headings.map((h, i) => {
      const id = slugifyHeading(h.textContent ?? '', i);
      h.id = id;
      return { id, text: h.textContent ?? '' };
    });
    setToc(entries);
    setActiveToc(entries[0]?.id ?? null);

    const observer = new IntersectionObserver(
      (observerEntries) => {
        for (const entry of observerEntries) {
          if (entry.isIntersecting) {
            setActiveToc(entry.target.id);
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [article]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — no-op, button simply won't confirm
    }
  }

  function shareUrl(network: 'facebook' | 'x' | 'linkedin') {
    if (typeof window === 'undefined') return;
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(article?.title ?? '');
    const targets: Record<typeof network, string> = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      x: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    };
    window.open(targets[network], '_blank', 'noopener,noreferrer');
  }

  async function submitNewsletter(e: React.FormEvent) {
    e.preventDefault();
    setNewsletterState('sending');
    try {
      await api('/api/public/newsletter', { method: 'POST', body: { email: newsletterEmail } });
      setNewsletterState('sent');
      setNewsletterEmail('');
    } catch (err) {
      setNewsletterState('error');
      void err;
    }
  }

  const viewCountLabel = useMemo(
    () => (article ? `${article.viewCount.toLocaleString('fr-FR')} lectures` : ''),
    [article],
  );

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

      <div className="mx-auto max-w-[1280px] px-4 py-8 lg:px-7">
        {/* BREADCRUMB */}
        <div className="mb-6 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-[13px] text-gray-500">
          <Link href="/" className="shrink-0 hover:text-neutral-900">
            Accueil
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <Link href="/blog" className="shrink-0 hover:text-neutral-900">
            Blog
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <Link
            href={`/blog?category=${article.category.slug}`}
            className="shrink-0 hover:text-neutral-900"
          >
            {article.category.label}
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate font-medium text-neutral-900" aria-current="page">
            {article.title}
          </span>
        </div>

        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_320px]">
          {/* MAIN */}
          <div className="order-1 min-w-0">
            <Link
              href="/blog"
              className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-neutral-900 lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Retour au blog
            </Link>

            {/* HEADER */}
            <div className="mb-7">
              <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap uppercase',
                    categoryClasses(article.category.colorKey),
                  )}
                >
                  <Tag className="h-[11px] w-[11px]" aria-hidden />
                  {article.category.label}
                </span>
                {article.publishedAt && (
                  <span className="text-xs whitespace-nowrap text-gray-500">
                    {formatDate(article.publishedAt)}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs whitespace-nowrap text-gray-500">
                  <Clock className="h-3 w-3" aria-hidden />
                  {article.readTimeMinutes} min de lecture
                </span>
                <span className="flex items-center gap-1 text-xs whitespace-nowrap text-gray-500">
                  <Eye className="h-3 w-3" aria-hidden />
                  {viewCountLabel}
                </span>
              </div>

              <h1 className="font-sora mb-4 text-[26px] leading-tight font-extrabold tracking-[-0.03em] lg:text-[34px]">
                {article.title}
              </h1>

              <p className="mb-6 border-l-[3px] border-brand py-0.5 pl-4 text-base leading-relaxed text-gray-500">
                {article.excerpt}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-b border-black/[0.06] py-4">
                <div className="flex items-center gap-3">
                  {article.author.avatarUrl && (
                    <img
                      src={article.author.avatarUrl}
                      alt={article.author.name}
                      className="h-11 w-11 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-bold">{article.author.name}</p>
                    {article.author.role && (
                      <p className="text-xs text-gray-500">{article.author.role}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs whitespace-nowrap text-gray-500">Partager :</span>
                  <button
                    type="button"
                    onClick={() => shareUrl('facebook')}
                    aria-label="Partager sur Facebook"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] text-[11px] font-bold text-gray-500 hover:bg-gray-50"
                  >
                    f
                  </button>
                  <button
                    type="button"
                    onClick={() => shareUrl('x')}
                    aria-label="Partager sur X"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] text-[11px] font-bold text-gray-500 hover:bg-gray-50"
                  >
                    X
                  </button>
                  <button
                    type="button"
                    onClick={() => shareUrl('linkedin')}
                    aria-label="Partager sur LinkedIn"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] text-[11px] font-bold text-gray-500 hover:bg-gray-50"
                  >
                    in
                  </button>
                  <button
                    type="button"
                    onClick={copyLink}
                    aria-label="Copier le lien"
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-black/[0.08] text-gray-500 hover:bg-gray-50"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* HERO IMAGE */}
            {article.coverImageUrl ? (
              <img
                src={cloudinaryOptimize(article.coverImageUrl, 900)}
                alt={article.title}
                className="mb-9 h-[220px] w-full rounded-2xl object-cover lg:h-[420px]"
              />
            ) : (
              <div className="mb-9 flex h-[220px] w-full items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-50 lg:h-[420px]">
                <Home className="h-10 w-10 text-brand/40" aria-hidden />
              </div>
            )}

            {/* CONTENT */}
            <div
              ref={contentRef}
              className="prose prose-neutral max-w-none text-[15px] leading-[1.8] [&_h2]:mt-9 [&_h2]:mb-3.5 [&_h2]:text-[22px] [&_h2]:font-extrabold [&_h2]:tracking-[-0.02em] [&_h3]:mt-6 [&_h3]:mb-2.5 [&_h3]:text-[17px] [&_h3]:font-bold [&_p]:mb-4.5 [&_ul]:mb-4.5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-2"
              // contentHtml is sanitized server-side at write time (admin-only
              // write path, see lib/server/blog/sanitize.ts) — never re-sanitized
              // here, never populated from unmoderated user input.
              dangerouslySetInnerHTML={{ __html: article.contentHtml }}
            />

            {/* TAGS */}
            {article.tags.length > 0 && (
              <div className="mt-9 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-7">
                <span className="text-[13px] font-semibold whitespace-nowrap">Sujets :</span>
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

            {/* RELATED */}
            {related.length > 0 && (
              <div className="mt-12 border-t border-black/[0.06] pt-9">
                <p className="mb-5 text-lg font-extrabold tracking-[-0.02em]">
                  Articles similaires
                </p>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {related.map((a) => (
                    <Link
                      key={a.id}
                      href={`/blog/${a.slug}`}
                      className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08]"
                    >
                      {a.coverImageUrl ? (
                        <img
                          src={cloudinaryOptimize(a.coverImageUrl, 400)}
                          alt={a.title}
                          className="h-[140px] w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-[140px] w-full items-center justify-center bg-gradient-to-br from-sky-50 to-blue-50">
                          <Home className="h-6 w-6 text-brand/40" aria-hidden />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                        <span
                          className={cn(
                            'inline-flex w-fit items-center rounded-full px-2.5 py-[3px] text-[10px] font-bold whitespace-nowrap uppercase',
                            categoryClasses(a.category.colorKey),
                          )}
                        >
                          {a.category.label}
                        </span>
                        <p className="flex-1 text-[13px] leading-snug font-bold">{a.title}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {a.publishedAt && (
                            <span className="text-[11px] whitespace-nowrap text-gray-500">
                              {formatDate(a.publishedAt)}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[11px] whitespace-nowrap text-gray-500">
                            <Clock className="h-[11px] w-[11px]" aria-hidden />
                            {a.readTimeMinutes} min
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <div className="order-2 flex flex-col gap-6 lg:sticky lg:top-6">
            {/* TOC */}
            {toc.length > 0 && (
              <div className="rounded-2xl border border-black/[0.08] p-5">
                <div className="mb-4 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.1em] uppercase">
                  <List className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                  Sommaire
                </div>
                <div className="flex flex-col gap-1">
                  {toc.map((t, i) => (
                    <a
                      key={t.id}
                      href={`#${t.id}`}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-[13px] leading-snug',
                        activeToc === t.id
                          ? 'bg-brand/10 font-semibold text-brand'
                          : 'text-gray-500 hover:bg-gray-50',
                      )}
                    >
                      <span className="w-4 shrink-0 text-[11px] font-bold opacity-60">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {t.text}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* NEWSLETTER */}
            <div className="rounded-2xl border border-black/[0.08] p-5">
              <div className="mb-4 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.1em] uppercase">
                <Mail className="h-3.5 w-3.5 text-brand" aria-hidden />
                Newsletter
              </div>
              <p className="mb-3.5 text-[13px] leading-relaxed text-gray-500">
                Recevez chaque semaine les meilleures analyses immobilières directement dans votre
                boîte mail.
              </p>
              {newsletterState === 'sent' ? (
                <p className="text-[13px] font-semibold text-emerald-600">
                  Merci ! Vérifiez votre boîte mail.
                </p>
              ) : (
                <form onSubmit={submitNewsletter}>
                  <input
                    required
                    type="email"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    placeholder="Votre adresse email"
                    className="mb-2.5 w-full rounded-lg border border-black/[0.08] bg-gray-50 px-3.5 py-2.5 text-[13px] outline-none placeholder:text-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={newsletterState === 'sending'}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[13px] font-bold whitespace-nowrap text-white disabled:opacity-50"
                  >
                    {newsletterState === 'sending' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-3.5 w-3.5" aria-hidden />
                    )}
                    S&apos;abonner gratuitement
                  </button>
                  {newsletterState === 'error' && (
                    <p className="mt-2 text-[11px] text-red-500">
                      Échec de l&apos;inscription. Réessayez.
                    </p>
                  )}
                </form>
              )}
            </div>

            {/* POPULAR */}
            {popular.length > 0 && (
              <div className="rounded-2xl border border-black/[0.08] p-5">
                <div className="mb-4 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.1em] uppercase">
                  <Flame className="h-3.5 w-3.5 text-red-500" aria-hidden />
                  Articles populaires
                </div>
                <div className="flex flex-col gap-3.5">
                  {popular.map((p, i) => (
                    <Link key={p.id} href={`/blog/${p.slug}`} className="flex items-start gap-3">
                      <span className="w-5 flex-shrink-0 text-xl leading-none font-black text-brand/30">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <p className="mb-0.5 text-[13px] leading-snug font-semibold">{p.title}</p>
                        <p className="text-[11px] text-gray-500">
                          {p.viewCount.toLocaleString('fr-FR')} lectures · {p.readTimeMinutes} min
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* PROMO */}
            <div
              className="rounded-2xl p-6 text-center"
              style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)' }}
            >
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/20">
                <Home className="h-[22px] w-[22px] text-white" aria-hidden />
              </div>
              <p className="mb-2 text-[15px] font-extrabold whitespace-nowrap text-white">
                Trouvez votre bien idéal
              </p>
              <p className="mb-4 text-xs leading-relaxed text-white/80">
                Des milliers d&apos;annonces vérifiées au Bénin, Togo, Côte d&apos;Ivoire et
                Sénégal. Des agents certifiés à votre service.
              </p>
              <Link
                href="/annonces"
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-bold whitespace-nowrap text-brand"
              >
                Voir les annonces
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
