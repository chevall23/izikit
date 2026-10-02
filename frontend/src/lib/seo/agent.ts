// SEO helpers for public agent profiles (/agents/[id]).
import { cleanText, truncate } from './text';

export interface AgentSeoFields {
  name: string | null;
  avatarUrl: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  stats: { activeListings: number; reviewCount: number; ratingAvg: number | null };
}

function place(a: Pick<AgentSeoFields, 'city' | 'country'>): string | null {
  if (a.city && a.country) return `${a.city} (${a.country})`;
  return a.city ?? a.country;
}

export function agentSeoTitle(a: AgentSeoFields): string {
  const where = place(a);
  const role = where ? `agent immobilier à ${where}` : 'agent immobilier';
  return a.name ? `${a.name}, ${role}` : role.charAt(0).toUpperCase() + role.slice(1);
}

export function agentSeoDescription(a: AgentSeoFields): string {
  const n = a.stats.activeListings;
  const who = a.name ?? 'cet agent immobilier';
  const where = place(a);
  const lead =
    `${n} annonce${n > 1 ? 's' : ''} immobilière${n > 1 ? 's' : ''} de ${who}` +
    (where ? ` à ${where}` : '') +
    ' sur Habitat-Afrik.';
  return truncate([lead, a.bio ? cleanText(a.bio) : null].filter(Boolean).join(' '), 160);
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
