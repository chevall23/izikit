// Agent directory — the first page is rendered on the server so search
// engines see the agents and follow the links to their profiles.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/site';
import { searchPublicAgents } from '@/lib/server/public/agents';
import { AGENTS_PAGE_SIZE } from '@/lib/agents';
import { AgentsClient } from './AgentsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: "Agents immobiliers vérifiés en Afrique de l'Ouest",
  description:
    'Trouvez un agent immobilier de confiance à Cotonou, Lomé, Abidjan ou Dakar : profils vérifiés, avis clients et annonces en cours.',
  path: '/agents',
});

export default async function AgentsPage() {
  const data = await searchPublicAgents(
    new URLSearchParams({ page: '1', limit: String(AGENTS_PAGE_SIZE), sort: 'listings' }),
  ).catch(() => null);
  return <AgentsClient initialData={data} />;
}
