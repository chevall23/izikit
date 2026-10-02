// Landing pages /immobilier/<pays>[/<ville>][/<offre>] — fully
// server-rendered listing pages for the searches people actually type
// ("appartement à louer Cotonou", "terrain à vendre Lomé"…), with crawlable
// pagination and links to the neighbouring cities / types / transactions.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';
import { ListingCard } from '@/components/public/ListingCard';
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { PROPERTY_TYPE_LABEL, TRANSACTION_TYPE_LABEL } from '@/lib/listings';
import { landingPath, parseLandingSegments, type LandingTarget } from '@/lib/seo/landing';
import { listingSearchHeading } from '@/lib/seo/listing';
import { absoluteUrl, pageMetadata } from '@/lib/seo/site';
import { LANDING_MIN_LISTINGS, loadLanding, resolveCitySlug } from '@/lib/server/public/landing';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const resolveTarget = cache(async (key: string): Promise<LandingTarget | null> => {
  const parsed = parseLandingSegments(key.split('/'));
  if (!parsed) return null;
  const { citySlug, ...rest } = parsed;
  if (!citySlug) return rest;
  const city = await resolveCitySlug(parsed.country, citySlug);
  return city ? { ...rest, city } : null;
});

const loadPage = cache((key: string, page: number) =>
  resolveTarget(key).then((t) => (t ? loadLanding(t, page) : null)),
);

function parsePage(raw: string | string[] | undefined): number {
  const n = Number.parseInt(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''), 10);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

function pageHref(base: string, page: number) {
  return page > 1 ? `${base}?page=${page}` : base;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const key = (await params).segments.join('/');
  const page = parsePage((await searchParams).page);
  const target = await resolveTarget(key);
  const data = await loadPage(key, page);
  if (!target || !data) return { title: 'Page introuvable', robots: { index: false } };

  const heading = listingSearchHeading(target);
  const base = landingPath(target);
  return pageMetadata({
    title: page > 1 ? `${heading} — page ${page}` : heading,
    description: `${data.total} annonce${data.total > 1 ? 's' : ''} : ${heading.charAt(0).toLowerCase()}${heading.slice(1)}. Photos, prix et contact direct d'agents immobiliers vérifiés sur Habitat-Afrik.`,
    path: pageHref(base, page),
    noindex: data.total < LANDING_MIN_LISTINGS,
  });
}

export default async function LandingPage({ params, searchParams }: Props) {
  const segments = (await params).segments;
  const key = segments.join('/');
  const page = parsePage((await searchParams).page);
  const target = await resolveTarget(key);
  if (!target) notFound();

  const base = landingPath(target);
  if (`/immobilier/${key}` !== base) permanentRedirect(pageHref(base, page));

  const data = await loadPage(key, page);
  if (!data || (page > 1 && page > data.totalPages)) notFound();

  const heading = listingSearchHeading(target);
  const offer = { propertyType: target.propertyType, transactionType: target.transactionType };
  const searchQuery = new URLSearchParams({
    country: target.country,
    ...(target.city && { city: target.city }),
    ...(target.propertyType && { propertyType: target.propertyType }),
    ...(target.transactionType && { transactionType: target.transactionType }),
  });

  const crumbs = [
    { name: 'Accueil', path: '/' },
    {
      name: listingSearchHeading({ country: target.country }),
      path: landingPath({ country: target.country }),
    },
    ...(target.city
      ? [
          {
            name: listingSearchHeading({ country: target.country, city: target.city }),
            path: landingPath({ country: target.country, city: target.city }),
          },
        ]
      : []),
    ...(offer.propertyType || offer.transactionType ? [{ name: heading, path: base }] : []),
  ];

  return (
    <div className="bg-white text-neutral-900">
      <JsonLd
        data={breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: absoluteUrl(c.path) })))}
      />
      <PublicNavbar active="annonces" />

      <div className="border-b border-black/[0.06]">
        <div className="mx-auto max-w-[1280px] px-4 py-8 lg:px-7">
          <nav
            aria-label="Fil d'Ariane"
            className="mb-2.5 flex flex-wrap items-center gap-2 text-[13px] text-gray-500"
          >
            {crumbs.map((c, i) => (
              <span key={c.path} className="flex items-center gap-2">
                {i > 0 && <span className="text-gray-300">/</span>}
                {i < crumbs.length - 1 ? (
                  <Link href={c.path} className="text-gray-500">
                    {c.name}
                  </Link>
                ) : (
                  <span className="font-medium text-neutral-900">{c.name}</span>
                )}
              </span>
            ))}
          </nav>
          <h1 className="font-sora text-[26px] font-extrabold tracking-[-0.04em] lg:text-[32px]">
            {heading}
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            <span className="font-semibold text-brand">
              {data.total} annonce{data.total > 1 ? 's' : ''}
            </span>{' '}
            publiée{data.total > 1 ? 's' : ''} par des agents immobiliers vérifiés.{' '}
            <Link href={`/annonces?${searchQuery.toString()}`} className="font-semibold text-brand">
              Affiner la recherche
            </Link>
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-[1280px] px-4 py-8 lg:px-7">
        {data.items.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500">
            Aucune annonce pour le moment.{' '}
            <Link href="/demande-immobiliere/nouvelle" className="font-semibold text-brand">
              Déposez une demande
            </Link>{' '}
            : les agents qui disposent de ce type de bien vous contacteront.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}

        {data.totalPages > 1 && (
          <nav
            aria-label="Pagination"
            className="mt-10 flex flex-wrap items-center justify-center gap-2"
          >
            {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={pageHref(base, p)}
                aria-current={p === page ? 'page' : undefined}
                className={
                  p === page
                    ? 'rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white'
                    : 'rounded-lg border border-black/[0.08] px-3.5 py-2 text-sm text-neutral-700'
                }
              >
                {p}
              </Link>
            ))}
          </nav>
        )}

        <section className="mt-14 grid grid-cols-1 gap-8 border-t border-black/[0.06] pt-10 md:grid-cols-3">
          {data.cities.length > 1 && (
            <LinkBlock
              title={
                target.city ? `Autres villes · ${target.country}` : `Villes · ${target.country}`
              }
              links={data.cities
                .filter((c) => c.value !== target.city)
                .map((c) => ({
                  label: c.value,
                  count: c.count,
                  href: landingPath({ country: target.country, city: c.value, ...offer }),
                }))}
            />
          )}
          {data.types.length > 0 && (
            <LinkBlock
              title="Type de bien"
              links={data.types.map((t) => ({
                label: PROPERTY_TYPE_LABEL[t.value] ?? t.value,
                count: t.count,
                href: landingPath({ ...target, propertyType: t.value }),
              }))}
            />
          )}
          {data.transactions.length > 0 && (
            <LinkBlock
              title="Transaction"
              links={data.transactions.map((t) => ({
                label: TRANSACTION_TYPE_LABEL[t.value] ?? t.value,
                count: t.count,
                href: landingPath({ ...target, transactionType: t.value }),
              }))}
            />
          )}
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

function LinkBlock({
  title,
  links,
}: {
  title: string;
  links: { label: string; count: number; href: string }[];
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold text-neutral-900">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-block rounded-full border border-black/[0.08] px-3 py-1.5 text-[13px] text-neutral-700"
            >
              {l.label} <span className="text-gray-400">({l.count})</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
