// Metadata for the (client-rendered) property request form.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: 'Déposer une demande immobilière',
  description:
    'Décrivez le bien que vous cherchez (type, ville, budget) : les agents immobiliers vérifiés de la zone vous proposent des biens correspondants.',
  path: '/demande-immobiliere/nouvelle',
});

export default function NouvelleDemandeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
