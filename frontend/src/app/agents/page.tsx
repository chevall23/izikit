// Agent directory — the first page is rendered on the server so search
// engines see the agents and follow the links to their profiles.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/site';
import { searchPublicAgents } from '@/lib/server/public/agents';
import { AgentsClient } from './AgentsClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = pageMetadata({
  title: 'Agents immobiliers vérifiés au Bénin, au Togo, en Côte d’Ivoire et au Sénégal',
  description:
    "Trouvez un agent immobilier de confiance : profils vérifiés, avis clients et annonces en cours à Cotonou, Lomé, Abidjan, Dakar et partout en Afrique de l'Ouest.",
  path: '/agents',
});

export default async function AgentsPage() {
  const data = await searchPublicAgents(new URLSearchParams({ page: '1', limit: '9' })).catch(
    () => null,
  );
  return <AgentsClient initialData={data} />;
}
