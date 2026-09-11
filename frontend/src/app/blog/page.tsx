'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Home,
  Loader2,
  Mail,
  Search,
  Send,
  Star,
  Tag,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { formatDate } from '@/lib/alerts';
import { cloudinaryOptimize } from '@/lib/listings';

interface Category {
  slug: string;
  label: string;
  colorKey: string;
  count: number;
}

interface ArticleItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  tags: string[];
  author: { name: string; role: string | null; avatarUrl: string | null };
  category: { slug: string; label: string; colorKey: string };
  readTimeMinutes: number;
  publishedAt: string | null;
  viewCount: number;
}

interface ArticlesResponse {
  items: ArticleItem[];
  featured: ArticleItem | null;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface TagItem {
  tag: string;
  count: number;
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

const PAGE_LIMIT = 7;

export default function BlogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySlug, setCategorySlug] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [articles, setArticles] = useState<ArticlesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [popular, setPopular] = useState<ArticleItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterState, setNewsletterState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  useEffect(() => {
    api<{ categories: Category[] }>('/api/public/blog/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
    api<{ tags: TagItem[] }>('/api/public/blog/tags')
      .then((res) => setTags(res.tags))
      .catch(() => setTags([]));
    api<ArticlesResponse>('/api/public/blog/articles?sort=popular&limit=5')
      .then((res) => setPopular(res.items))
      .catch(() => setPopular([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (categorySlug) params.set('category', categorySlug);
    if (query) params.set('q', query);
    params.set('page', String(page));
    params.set('limit', String(PAGE_LIMIT));

    api<ArticlesResponse>(`/api/public/blog/articles?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setArticles(res);
      })
      .catch(() => {
        if (cancelled) return;
        setArticles(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [categorySlug, query, page]);

  function selectCategory(slug: string) {
    setCategorySlug(slug);
    setPage(1);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(searchInput.trim());
    setPage(1);
  }

  function selectTag(tag: string) {
    setSearchInput(tag);
    setQuery(tag);
    setPage(1);
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

  const totalArticles = categories.reduce((sum, c) => sum + c.count, 0);
  const visibleItems = (articles?.items ?? []).filter((a) => a.id !== articles?.featured?.id);
  const grid = visibleItems.slice(0, 3);
  const list = visibleItems.slice(3);
  const totalPages = articles?.totalPages ?? 1;
  const featured = articles?.featured ?? null;

  return (
    <div className="bg-white text-neutral-900">
      <PublicNavbar active="blog" />

      {/* HERO */}
      <section
        className="relative overflow-hidden px-4 py-14 text-center lg:px-7 lg:py-16"
        style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 50%, #0F172A 100%)' }}
      >
        <div className="pointer-events-none absolute -top-[180px] -right-20 h-[500px] w-[500px] rounded-full bg-white/5" />
        <div className="relative z-[1] mx-auto max-w-[1280px]">
          <div className="mb-4.5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold tracking-[0.12em] whitespace-nowrap text-white/90 uppercase">
            <BookOpen className="h-3 w-3" aria-hidden />
            Blog &amp; Actualités
          </div>
          <h1 className="font-sora mx-auto mb-3.5 max-w-[720px] text-[28px] leading-[1.1] font-extrabold tracking-[-0.04em] text-white lg:text-[44px]">
            L&apos;immobilier en Afrique de l&apos;Ouest, décrypté pour vous
          </h1>
          <p className="mx-auto mb-7 max-w-[560px] text-[15px] leading-relaxed text-white/75 lg:text-base">
            Conseils d&apos;experts, analyses de marché, actualités juridiques et tendances
            immobilières au Bénin, Togo, Côte d&apos;Ivoire et Sénégal.
          </p>
          <form
            onSubmit={submitSearch}
            className="mx-auto flex max-w-[520px] items-center gap-0 rounded-full bg-white shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
          >
            <div className="flex flex-shrink-0 items-center pl-4.5">
              <Search className="h-4 w-4 text-gray-400" aria-hidden />
            </div>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Rechercher un article, un sujet…"
              className="flex-1 truncate bg-transparent px-4 py-3.5 text-left text-sm text-neutral-900 outline-none placeholder:text-gray-400"
            />
            <button
              type="submit"
              className="m-1 flex items-center gap-2 rounded-full bg-brand px-[22px] py-3 text-sm font-semibold whitespace-nowrap text-white"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              Rechercher
            </button>
          </form>
        </div>
      </section>

      {/* CATEGORIES */}
      <div className="border-b border-black/[0.06] px-4 lg:px-7">
        <div className="mx-auto max-w-[1280px] overflow-x-auto">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => selectCategory('')}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-4.5 py-4 text-[13px] font-semibold whitespace-nowrap',
                categorySlug === ''
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-neutral-900',
              )}
            >
              Tous les articles
              <span
                className={cn(
                  'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                  categorySlug === '' ? 'bg-brand/15 text-brand' : 'bg-gray-100 text-gray-500',
                )}
              >
                {totalArticles}
              </span>
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => selectCategory(c.slug)}
                className={cn(
                  'flex items-center gap-1.5 border-b-2 px-4.5 py-4 text-[13px] font-semibold whitespace-nowrap',
                  categorySlug === c.slug
                    ? 'border-brand text-brand'
                    : 'border-transparent text-gray-500 hover:text-neutral-900',
                )}
              >
                {c.label}
                <span
                  className={cn(
                    'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                    categorySlug === c.slug
                      ? 'bg-brand/15 text-brand'
                      : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {c.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN */}
      <section className="px-4 py-11 pb-20 lg:px-7">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 lg:grid-cols-[1fr_320px] lg:items-start">
          {/* LEFT */}
          <div className="order-2 flex flex-col gap-8 lg:order-1">
            {/* FEATURED */}
            {featured && (
              <div>
                <div className="mb-5 flex items-center gap-2 text-[17px] font-bold">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                  Article à la une
                </div>
                <Link
                  href={`/blog/${featured.slug}`}
                  className="grid grid-cols-1 overflow-hidden rounded-2xl border border-black/[0.08] lg:grid-cols-2"
                >
                  {featured.coverImageUrl ? (
                    <img
                      src={cloudinaryOptimize(featured.coverImageUrl, 600)}
                      alt={featured.title}
                      className="h-[220px] w-full object-cover lg:h-full"
                    />
                  ) : (
                    <div className="flex h-[220px] flex-col items-center justify-center gap-2 bg-gradient-to-br from-sky-100 to-blue-50 lg:h-full">
                      <TrendingUp className="h-8 w-8 text-brand" aria-hidden />
                    </div>
                  )}
                  <div className="flex flex-col justify-center gap-3.5 p-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold whitespace-nowrap uppercase',
                          categoryClasses(featured.category.colorKey),
                        )}
                      >
                        <TrendingUp className="h-[11px] w-[11px]" aria-hidden />
                        {featured.category.label}
                      </span>
                      {featured.publishedAt && (
                        <span className="text-[11px] whitespace-nowrap text-gray-500">
                          {formatDate(featured.publishedAt)} · {featured.readTimeMinutes} min
                        </span>
                      )}
                    </div>
                    <p className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
                      {featured.title}
                    </p>
                    <p className="text-sm leading-relaxed text-gray-500">{featured.excerpt}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {featured.author.avatarUrl && (
                        <img
                          src={featured.author.avatarUrl}
                          alt={featured.author.name}
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      )}
                      <span className="text-[13px] font-semibold whitespace-nowrap">
                        {featured.author.name}
                      </span>
                      {featured.author.role && (
                        <span className="text-xs whitespace-nowrap text-gray-500">
                          {featured.author.role}
                        </span>
                      )}
                    </div>
                    <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-brand px-4.5 py-2.5 text-[13px] font-bold whitespace-nowrap text-white">
                      Lire l&apos;article
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* GRID */}
            <div>
              <div className="mb-5 flex items-center justify-between gap-4">
                <span className="text-[17px] font-bold">Derniers articles</span>
              </div>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" aria-hidden />
                </div>
              ) : grid.length === 0 ? (
                <div className="rounded-2xl border border-black/[0.06] bg-gray-50 p-8 text-center text-sm text-gray-500">
                  Aucun article dans cette catégorie.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {grid.map((a) => (
                    <Link
                      key={a.id}
                      href={`/blog/${a.slug}`}
                      className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08]"
                    >
                      {a.coverImageUrl ? (
                        <img
                          src={cloudinaryOptimize(a.coverImageUrl, 400)}
                          alt={a.title}
                          className="h-40 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-40 w-full items-center justify-center bg-gradient-to-br from-sky-50 to-blue-50">
                          <TrendingUp className="h-6 w-6 text-brand/50" aria-hidden />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <span
                          className={cn(
                            'inline-flex w-fit items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap uppercase',
                            categoryClasses(a.category.colorKey),
                          )}
                        >
                          {a.category.label}
                        </span>
                        <p className="text-sm leading-snug font-bold">{a.title}</p>
                        <p className="flex-1 text-[13px] leading-relaxed text-gray-500">
                          {a.excerpt}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold whitespace-nowrap">
                              {a.author.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
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
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* LIST */}
            {list.length > 0 && (
              <div>
                <div className="mb-5 text-[17px] font-bold">Plus d&apos;articles</div>
                <div className="flex flex-col gap-4">
                  {list.map((a) => (
                    <Link
                      key={a.id}
                      href={`/blog/${a.slug}`}
                      className="flex gap-4 rounded-xl border border-black/[0.08] p-4"
                    >
                      {a.coverImageUrl ? (
                        <img
                          src={cloudinaryOptimize(a.coverImageUrl, 200)}
                          alt={a.title}
                          className="h-[76px] w-[100px] flex-shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-[76px] w-[100px] flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-50 to-blue-50">
                          <TrendingUp className="h-5 w-5 text-brand/50" aria-hidden />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'mb-1.5 inline-flex w-fit items-center rounded-full px-2.5 py-[3px] text-[11px] font-bold whitespace-nowrap uppercase',
                            categoryClasses(a.category.colorKey),
                          )}
                        >
                          {a.category.label}
                        </span>
                        <p className="mb-1 text-sm leading-snug font-bold">{a.title}</p>
                        <p className="mb-2 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
                          {a.excerpt}
                        </p>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-xs font-semibold whitespace-nowrap">
                            {a.author.name}
                          </span>
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

            {/* PAGINATION */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/[0.08] text-gray-500 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold',
                      n === page
                        ? 'bg-brand text-white'
                        : 'border border-black/[0.08] text-gray-500',
                    )}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-black/[0.08] text-gray-500 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <div className="order-1 flex flex-col gap-6 lg:order-2">
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

            {/* TAGS */}
            {tags.length > 0 && (
              <div className="rounded-2xl border border-black/[0.08] p-5">
                <div className="mb-4 flex items-center gap-1.5 text-[13px] font-bold tracking-[0.1em] uppercase">
                  <Tag className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                  Sujets populaires
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      onClick={() => selectTag(t.tag)}
                      className={cn(
                        'rounded-full border px-3 py-[5px] text-xs font-medium whitespace-nowrap',
                        query === t.tag
                          ? 'border-brand/30 bg-brand/10 text-brand'
                          : 'border-black/[0.08] bg-gray-50 text-gray-500',
                      )}
                    >
                      {t.tag}
                    </button>
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
      </section>

      <PublicFooter />
    </div>
  );
}
