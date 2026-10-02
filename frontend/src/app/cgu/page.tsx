import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/public/LegalPage';
import { COMPANY, LEGAL_LAST_UPDATED, PLATFORM_CONTACT_EMAIL } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: "Conditions générales d'utilisation",
  description:
    "Conditions générales d'utilisation de la plateforme Habitat-Afrik : compte, publication d'annonces, jetons, avis, responsabilités et droit applicable.",
  path: '/cgu',
});

export default function CguPage() {
  return (
    <LegalPage title="Conditions générales d'utilisation" updated={LEGAL_LAST_UPDATED}>
      <h2>1. Objet</h2>
      <p>
        Les présentes conditions générales d&apos;utilisation (« CGU ») définissent les conditions
        dans lesquelles {COMPANY.name} (« la Société ») met à la disposition des utilisateurs la
        plateforme Habitat-Afrik, accessible à l&apos;adresse habitat-afrik.com (« le Site »). Toute
        utilisation du Site emporte l&apos;acceptation sans réserve des présentes CGU.
      </p>

      <h2>2. Description du service</h2>
      <p>
        Habitat-Afrik est une plateforme de publication d&apos;annonces immobilières (vente,
        location, séjour) au Bénin, au Togo, en Côte d&apos;Ivoire et au Sénégal. Elle permet :
      </p>
      <ul>
        <li>aux visiteurs de consulter les annonces et les profils des agents immobiliers ;</li>
        <li>
          aux utilisateurs inscrits de contacter les agents, demander des visites, créer des
          alertes, déposer des demandes immobilières et publier des avis ;
        </li>
        <li>
          aux agents immobiliers et propriétaires (« Annonceurs ») de publier et gérer leurs
          annonces.
        </li>
      </ul>
      <p>
        La Société n&apos;est ni vendeur, ni bailleur, ni mandataire des biens proposés : elle met
        en relation les utilisateurs et les Annonceurs, qui concluent leurs transactions directement
        entre eux.
      </p>

      <h2>3. Compte utilisateur</h2>
      <p>
        L&apos;accès à certaines fonctionnalités nécessite la création d&apos;un compte. Vous vous
        engagez à fournir des informations exactes et à les tenir à jour. Votre identifiant et votre
        mot de passe sont personnels : vous êtes responsable de leur confidentialité et de toute
        utilisation de votre compte, sauf preuve d&apos;une utilisation frauduleuse qui ne vous
        serait pas imputable. En cas de perte ou d&apos;utilisation frauduleuse, prévenez
        immédiatement la Société à{' '}
        <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a>.
      </p>

      <h2>4. Publication des annonces</h2>
      <p>L&apos;Annonceur s&apos;engage à :</p>
      <ul>
        <li>
          ne publier que des biens réellement disponibles, qu&apos;il est autorisé à proposer ;
        </li>
        <li>
          fournir une description, un prix, une localisation et des photos fidèles au bien, et
          retirer ou mettre à jour l&apos;annonce dès que le bien n&apos;est plus disponible ;
        </li>
        <li>
          ne pas publier de contenu trompeur, discriminatoire, contraire à la loi ou portant
          atteinte aux droits de tiers (notamment sur les photos).
        </li>
      </ul>
      <p>
        Les annonces sont vérifiées avant leur mise en ligne. La Société peut refuser, suspendre ou
        retirer toute annonce ou tout compte ne respectant pas les présentes CGU, sans préavis en
        cas de manquement grave. Les documents transmis pour la vérification d&apos;un agent ou
        d&apos;un bien ne sont pas rendus publics.
      </p>

      <h2>5. Jetons et paiements</h2>
      <p>
        L&apos;ouverture d&apos;un compte et la consultation des annonces sont gratuites (hors coûts
        de connexion facturés par votre opérateur). Certains services, comme le déblocage du contact
        d&apos;un agent, sont payants et s&apos;acquièrent au moyen de jetons achetés sur le Site.
        Le prix des jetons et le nombre de jetons requis pour chaque service sont affichés avant
        tout achat. Les paiements sont traités par des prestataires de paiement agréés ; un service
        fourni (contact débloqué) n&apos;est pas remboursable.
      </p>

      <h2>6. Avis</h2>
      <p>
        Les avis publiés sur les agents doivent refléter une expérience réelle et rester courtois.
        La Société peut supprimer tout avis injurieux, diffamatoire, hors sujet ou manifestement
        frauduleux.
      </p>

      <h2>7. Garanties et responsabilité</h2>
      <p>
        Les annonces sont publiées sous la seule responsabilité des Annonceurs. La Société ne
        garantit ni l&apos;exactitude des informations qu&apos;elles contiennent, ni la suite donnée
        aux demandes de contact, ni la conclusion d&apos;une transaction. Elle n&apos;intervient pas
        dans les échanges et transactions entre utilisateurs et n&apos;agit pas en tant que
        médiateur : sa responsabilité ne saurait être engagée pour la conclusion, la non-conclusion,
        l&apos;exécution ou les litiges relatifs à ces transactions.
      </p>
      <p>
        Nous vous recommandons de visiter le bien et de vérifier les documents de propriété (titre
        foncier, mandat…) avant tout versement d&apos;argent, et de ne jamais payer un acompte à
        distance à un interlocuteur que vous n&apos;avez pas pu identifier.
      </p>
      <p>
        L&apos;utilisateur est seul responsable de l&apos;usage qu&apos;il fait du Site. La Société
        ne saurait être tenue responsable d&apos;une indisponibilité du service due à une
        défaillance des réseaux de télécommunications ou d&apos;électricité, à un cas de force
        majeure ou à une utilisation non conforme aux présentes CGU, ni des dommages indirects
        (perte de profit, de données…) résultant de l&apos;utilisation ou de l&apos;impossibilité
        d&apos;utiliser le Site. Le Site peut contenir des liens vers des sites tiers dont la
        Société ne contrôle pas le contenu.
      </p>

      <h2>8. Contenu illicite</h2>
      <p>
        En sa qualité d&apos;hébergeur des annonces au sens de la loi portant code du numérique en
        République du Bénin, la Société ne peut exercer une surveillance générale des contenus
        publiés. Si vous constatez qu&apos;une annonce ou un avis présente un caractère
        manifestement illicite ou frauduleux, signalez-le depuis la fiche concernée ou à{' '}
        <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a> : il sera examiné
        dans les meilleurs délais.
      </p>

      <h2>9. Propriété intellectuelle</h2>
      <p>
        La marque Habitat-Afrik, le Site et ses contenus éditoriaux sont protégés par le droit de la
        propriété intellectuelle. Toute reproduction ou exploitation non autorisée est interdite. En
        publiant une annonce, l&apos;Annonceur concède à la Société, pour la durée de publication,
        le droit de reproduire et diffuser les textes et photos de l&apos;annonce sur le Site et
        dans ses communications (réseaux sociaux, alertes e-mail).
      </p>

      <h2>10. Données personnelles</h2>
      <p>
        Le traitement de vos données est décrit dans la{' '}
        <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>

      <h2>11. Modification des CGU</h2>
      <p>
        La Société peut modifier les présentes CGU. La version applicable est celle en ligne au
        moment de l&apos;utilisation du Site ; les utilisateurs inscrits sont informés des
        modifications importantes.
      </p>

      <h2>12. Nullité partielle</h2>
      <p>
        Si une ou plusieurs stipulations des présentes CGU sont tenues pour non valides en
        application d&apos;une loi, d&apos;un règlement ou d&apos;une décision de justice
        définitive, les autres stipulations gardent toute leur force et leur portée.
      </p>

      <h2>13. Loi applicable</h2>
      <p>
        Les présentes CGU sont soumises au droit béninois. Tout litige relatif à leur interprétation
        ou à leur exécution relève des juridictions de Cotonou. Pour toute réclamation,
        contactez-nous via la <Link href="/contact">page contact</Link>.
      </p>
    </LegalPage>
  );
}
