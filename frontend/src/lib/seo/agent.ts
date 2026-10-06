// SEO helpers for public agent profiles (/agents/[id]).
import { inCountry } from './listing';
import { cleanText, truncate } from './text';

export interface AgentSeoFields {
  name: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  stats: { activeListings: number; reviewCount: number; ratingAvg: number | null };
}

/** "à Cotonou (Bénin)", "à Cotonou", "au Bénin" — or null when unknown. */
function place(a: Pick<AgentSeoFields, 'city' | 'country'>): string | null {
  if (a.city && a.country) return `à ${a.city} (${a.country})`;
  if (a.city) return `à ${a.city}`;
  return a.country ? inCountry(a.country) : null;
}

export function agentSeoTitle(a: AgentSeoFields): string {
  const where = place(a);
  const role = where ? `agent immobilier ${where}` : 'agent immobilier';
  return a.name ? `${a.name}, ${role}` : role.charAt(0).toUpperCase() + role.slice(1);
}

export function agentSeoDescription(a: AgentSeoFields): string {
  const n = a.stats.activeListings;
  const who = a.name ?? 'cet agent immobilier';
  const where = place(a);
  const lead =
    `${n} annonce${n > 1 ? 's' : ''} immobilière${n > 1 ? 's' : ''} de ${who}` +
    (where ? ` ${where}` : '') +
    ' sur Habitat-Afrik.';
  // Without a bio the lead alone is too thin for a search snippet.
  const more = a.bio
    ? cleanText(a.bio)
    : 'Agent vérifié : consultez ses biens à vendre ou à louer et contactez cet agent directement.';
  return truncate(`${lead} ${more}`, 160);
}

export function agentJsonLd(a: AgentSeoFields, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: a.name ?? agentSeoTitle(a),
    url,
    ...(a.avatarUrl && { image: a.avatarUrl }),
    ...(a.bio && { description: cleanText(a.bio) }),
    ...((a.city || a.country) && {
      address: {
        '@type': 'PostalAddress',
        ...(a.city && { addressLocality: a.city }),
        ...(a.country && { addressCountry: a.country }),
      },
    }),
    ...(a.stats.reviewCount > 0 &&
      a.stats.ratingAvg !== null && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: Math.round(a.stats.ratingAvg * 10) / 10,
          reviewCount: a.stats.reviewCount,
          bestRating: 5,
        },
      }),
  };
}
