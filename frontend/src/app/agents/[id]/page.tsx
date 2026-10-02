// Agent profile — rendered on the server (as an anonymous visitor sees it)
// so search engines get the profile, its listings and structured data.
// Profiles without a live listing are thin content: reachable, not indexed.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { loadPublicAgent } from '@/lib/server/public/agent';
import { agentJsonLd, agentSeoDescription, agentSeoTitle } from '@/lib/seo/agent';
import { absoluteUrl, pageMetadata } from '@/lib/seo/site';
import { JsonLd, breadcrumbJsonLd } from '@/components/seo/JsonLd';
import { AgentProfileClient } from './AgentProfileClient';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const loadAgent = cache(async (id: string) => (await loadPublicAgent(id))?.profile ?? null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const agent = await loadAgent((await params).id);
  if (!agent) return { title: 'Agent introuvable', robots: { index: false } };
  return pageMetadata({
    title: agentSeoTitle(agent),
    description: agentSeoDescription(agent),
    path: `/agents/${agent.id}`,
    type: 'website',
    ...(agent.avatarUrl && { image: { url: agent.avatarUrl, alt: agent.name ?? 'Agent' } }),
    noindex: agent.stats.activeListings === 0,
  });
}

export default async function AgentProfilePage({ params }: Props) {
  const agent = await loadAgent((await params).id);
  if (!agent) notFound();

  const url = absoluteUrl(`/agents/${agent.id}`);
  return (
    <>
      <JsonLd data={agentJsonLd(agent, url)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Accueil', url: absoluteUrl('/') },
          { name: 'Agents immobiliers', url: absoluteUrl('/agents') },
          { name: agent.name ?? 'Agent', url },
        ])}
      />
      <AgentProfileClient initialAgent={agent} />
    </>
  );
}
