import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/public/LegalPage';
import { COMPANY } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: 'À propos de Habitat-Afrik',
  description:
    "Habitat-Afrik, plateforme d'annonces immobilières éditée par DAA GROUP à Cotonou, met en relation acheteurs, locataires et agents immobiliers vérifiés au Bénin, au Togo, en Côte d'Ivoire et au Sénégal.",
  path: '/a-propos',
});

export default function AProposPage() {
  return (
    <LegalPage title="À propos de Habitat-Afrik">
      <p>
        <strong>Habitat-Afrik</strong> est une plateforme africaine de publication d&apos;annonces
        immobilières, destinée aux particuliers comme aux professionnels de l&apos;immobilier. Sa
        vocation : faciliter la rencontre entre les personnes qui cherchent un bien — à acheter, à
        louer ou pour un séjour — et les propriétaires ou agents immobiliers qui le proposent.
      </p>

      <h2>Ce que nous proposons</h2>
      <ul>
        <li>
          <strong>Des annonces dans quatre pays</strong> : maisons, villas, appartements, terrains,
          bureaux, boutiques et salles au Bénin, au Togo, en Côte d&apos;Ivoire et au Sénégal.
        </li>
        <li>
          <strong>Des agents vérifiés</strong> : les annonces sont contrôlées avant leur mise en
          ligne et les agents peuvent faire vérifier leur identité et leurs documents
          professionnels.
        </li>
        <li>
          <strong>Des demandes immobilières</strong> : décrivez le bien que vous cherchez, les
          agents qui en disposent vous contactent.
        </li>
        <li>
          <strong>Des alertes</strong> pour être prévenu dès qu&apos;un bien correspondant à vos
          critères est publié.
        </li>
        <li>
          <strong>Un blog</strong> de conseils pratiques : titre foncier, investissement, location,
          métier d&apos;agent.
        </li>
      </ul>

      <h2>Qui sommes-nous ?</h2>
      <p>
        Habitat-Afrik est éditée par <strong>{COMPANY.name}</strong>, société de droit béninois
        basée à Cotonou, spécialisée dans les services en ligne et l&apos;immobilier en Afrique de
        l&apos;Ouest (promotion, transaction et gestion locative).
      </p>

      <h2>Pourquoi choisir Habitat-Afrik ?</h2>
      <ul>
        <li>
          <strong>Variété de biens</strong> : location ou vente de maisons, villas, appartements,
          bureaux, terrains…
        </li>
        <li>
          <strong>Confiance</strong> : annonces modérées, agents vérifiés et avis clients.
        </li>
        <li>
          <strong>Gratuit pour chercher</strong> : la consultation des annonces et la création
          d&apos;un compte sont gratuites.
        </li>
        <li>
          <strong>Pour les professionnels</strong> : agent ou agence immobilière, créez votre compte
          et publiez vos annonces.
        </li>
      </ul>

      <p>
        Une question ? <Link href="/contact">Contactez-nous</Link> ou{' '}
        <Link href="/annonces">parcourez les annonces</Link>.
      </p>
    </LegalPage>
  );
}
