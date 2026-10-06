import { describe, expect, it } from 'vitest';
import { agentJsonLd, agentSeoDescription, agentSeoTitle } from './agent';

const agent = {
  id: 'agent1',
  name: 'Kofi Atta',
  avatarUrl: 'https://cdn.example/a.webp',
  city: 'Cotonou',
  country: 'Bénin',
  bio: 'Agent depuis 10 ans, appelez le 97 00 00 00. Spécialiste des villas à Fidjrossè.',
  stats: { activeListings: 12, reviewCount: 3, ratingAvg: 4.666 },
};

describe('agentSeoTitle', () => {
  it('names the agent and where they work', () => {
    expect(agentSeoTitle(agent)).toBe('Kofi Atta, agent immobilier à Cotonou (Bénin)');
    expect(agentSeoTitle({ ...agent, name: null, city: null, country: null })).toBe(
      'Agent immobilier',
    );
  });
});

describe('agentSeoDescription', () => {
  it('counts live listings and strips phone numbers from the bio', () => {
    const d = agentSeoDescription(agent);
    expect(d.startsWith('12 annonces immobilières de Kofi Atta')).toBe(true);
    expect(d).toContain('Spécialiste des villas');
    expect(d).not.toMatch(/97 00/);
    expect(d.length).toBeLessThanOrEqual(160);
  });
});

describe('agentJsonLd', () => {
  it('is a RealEstateAgent with a rounded aggregate rating', () => {
    const ld = agentJsonLd(agent, 'https://habitat-afrik.com/agents/agent1');
    expect(ld['@type']).toBe('RealEstateAgent');
    expect(ld.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.7,
      reviewCount: 3,
      bestRating: 5,
    });
    expect(
      agentJsonLd({ ...agent, stats: { ...agent.stats, reviewCount: 0 } }, 'u'),
    ).not.toHaveProperty('aggregateRating');
  });
});

describe('agent SEO without a city', () => {
  const noCity = { ...agent, city: null, bio: null };

  it('uses the right French preposition for the country', () => {
    expect(agentSeoTitle(noCity)).toBe('Kofi Atta, agent immobilier au Bénin');
    expect(agentSeoTitle({ ...noCity, country: "Côte d'Ivoire" })).toBe(
      "Kofi Atta, agent immobilier en Côte d'Ivoire",
    );
  });

  it('pads the description when the agent has no bio', () => {
    const d = agentSeoDescription(noCity);
    expect(d).toContain('au Bénin sur Habitat-Afrik.');
    expect(d.length).toBeGreaterThan(100);
    expect(d.length).toBeLessThanOrEqual(160);
  });
});
