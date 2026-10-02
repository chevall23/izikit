// Metadata for the (client-rendered) contact page.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: 'Contactez-nous',
  description:
    "Une question sur une annonce, votre compte ou la publication de vos biens ? Écrivez à l'équipe Habitat-Afrik, nous vous répondons rapidement.",
  path: '/contact',
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
