// Metadata for the (client-rendered) blog index. Article pages override it
// entirely through their own generateMetadata.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: "Blog immobilier : conseils pour acheter, louer et investir en Afrique de l'Ouest",
  description:
    "Titre foncier, investissement, location, conseils aux agents : les guides pratiques d'Habitat-Afrik pour réussir vos projets immobiliers au Bénin, au Togo, en Côte d'Ivoire et au Sénégal.",
  path: '/blog',
  absoluteTitle: true,
});

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
