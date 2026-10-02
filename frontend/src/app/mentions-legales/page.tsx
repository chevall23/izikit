import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/public/LegalPage';
import { COMPANY, HOST, LEGAL_LAST_UPDATED, PLATFORM_CONTACT_EMAIL } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: 'Mentions légales',
  description:
    'Mentions légales du site Habitat-Afrik : éditeur (DAA GROUP, Cotonou), directeur de la publication, hébergeur et propriété intellectuelle.',
  path: '/mentions-legales',
});

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" updated={LEGAL_LAST_UPDATED}>
      <h2>Éditeur du site</h2>
      <p>
        Le site <strong>habitat-afrik.com</strong> (Habitat-Afrik) est édité par :
      </p>
      <ul>
        <li>
          <strong>{COMPANY.name}</strong>, société de droit béninois
        </li>
        <li>RCCM : {COMPANY.rccm}</li>
        <li>IFU : {COMPANY.ifu}</li>
        <li>Siège : {COMPANY.address}</li>
        <li>
          Courriel : <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a>
        </li>
        <li>
          Téléphone : <a href={`tel:${COMPANY.phone.replace(/\s+/g, '')}`}>{COMPANY.phone}</a>
        </li>
      </ul>

      <h2>Directeur de la publication</h2>
      <p>La direction de {COMPANY.name}.</p>

      <h2>Hébergement</h2>
      <p>Le site est hébergé par :</p>
      <ul>
        <li>
          <strong>{HOST.name}</strong>
        </li>
        <li>{HOST.address}</li>
        <li>
          Téléphone : <a href={`tel:${HOST.phone.replace(/\s+/g, '')}`}>{HOST.phone}</a>
        </li>
        <li>
          Site : <a href={HOST.website}>{HOST.website.replace(/^https?:\/\//, '')}</a>
        </li>
      </ul>
      <p>
        Les photos des annonces sont stockées et diffusées par Cloudflare, Inc. (101 Townsend St,
        San Francisco, CA 94107, États-Unis).
      </p>

      <h2>Contenus publiés par les utilisateurs</h2>
      <p>
        Les annonces, photos, descriptions et avis sont publiés sous la seule responsabilité de
        leurs auteurs (agents immobiliers, propriétaires et utilisateurs). {COMPANY.name} agit en
        qualité d&apos;hébergeur de ces contenus : elle les modère et retire tout contenu
        manifestement illicite qui lui est signalé. Pour signaler une annonce, utilisez le bouton «
        Signaler » de la fiche ou écrivez à{' '}
        <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a>.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        La marque Habitat-Afrik, le logo, la charte graphique et l&apos;ensemble des contenus
        éditoriaux du site (textes, articles du blog, visuels, mise en forme) sont la propriété de{' '}
        {COMPANY.name} ou de ses partenaires, sauf mention contraire. Toute reproduction,
        représentation, modification ou exploitation, totale ou partielle, sans autorisation écrite
        préalable est interdite et constituerait une contrefaçon.
      </p>

      <h2>Responsabilité</h2>
      <p>
        {COMPANY.name} s&apos;efforce d&apos;assurer l&apos;exactitude et la mise à jour des
        informations diffusées sur ce site, sans pouvoir en garantir l&apos;exhaustivité. Les
        informations sont fournies à titre indicatif et ne constituent pas un engagement
        contractuel. Les conditions d&apos;utilisation du service sont précisées dans les{' '}
        <Link href="/cgu">conditions générales d&apos;utilisation</Link>.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Le traitement des données personnelles est décrit dans la{' '}
        <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>Droit applicable</h2>
      <p>
        Les présentes mentions légales sont régies par le droit béninois. Tout litige relatif à
        l&apos;utilisation du site relève de la compétence des juridictions de Cotonou.
      </p>
    </LegalPage>
  );
}
