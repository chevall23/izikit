// "Recherches populaires" — crawlable links to the most-stocked
// /immobilier landing pages (built on the server from live counts), so the
// home page and /annonces pass link equity to the city/offer pages.
import Link from 'next/link';

export interface PopularSearchLink {
  href: string;
  label: string;
  count: number;
}

export function PopularSearches({ links }: { links: PopularSearchLink[] }) {
  if (links.length === 0) return null;
  return (
    <section className="px-4 py-10 lg:px-7" aria-labelledby="popular-searches-title">
      <div className="mx-auto max-w-[1280px]">
        <h2 id="popular-searches-title" className="mb-4 text-[17px] font-bold text-neutral-900">
          Recherches populaires
        </h2>
        <ul className="flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-block rounded-full border border-black/[0.08] px-3.5 py-2 text-[13px] text-neutral-700 hover:border-brand/40 hover:text-brand"
              >
                {l.label} <span className="text-gray-400">({l.count})</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
