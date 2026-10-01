import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicNavbar } from '@/components/public/PublicNavbar';
import { PublicFooter } from '@/components/public/PublicFooter';

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <PublicNavbar active="annonces" />
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-semibold text-brand">Erreur 404</p>
        <h1 className="font-sora mt-2 text-3xl font-semibold text-neutral-900">
          Cette page est introuvable
        </h1>
        <p className="mt-3 text-base text-gray-500">
          L&apos;annonce a peut-être été retirée, ou le lien est incorrect. Poursuivez votre
          recherche parmi nos annonces immobilières.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/annonces"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white"
          >
            Voir les annonces
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-neutral-800"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
