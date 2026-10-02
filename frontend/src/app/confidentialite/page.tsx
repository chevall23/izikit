import type { Metadata } from 'next';
import { LegalPage } from '@/components/public/LegalPage';
import { COMPANY, HOST, LEGAL_LAST_UPDATED, PLATFORM_CONTACT_EMAIL } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = pageMetadata({
  title: 'Politique de confidentialité',
  description:
    'Quelles données Habitat-Afrik collecte, pourquoi, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer vos droits.',
  path: '/confidentialite',
});

const mail = <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`}>{PLATFORM_CONTACT_EMAIL}</a>;

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" updated={LEGAL_LAST_UPDATED}>
      <p>
        La présente politique décrit la manière dont {COMPANY.name} collecte et traite les données
        personnelles des visiteurs et des utilisateurs de la plateforme Habitat-Afrik
        (habitat-afrik.com).
      </p>

      <h2>Responsable du traitement</h2>
      <ul>
        <li>
          <strong>{COMPANY.name}</strong> — RCCM {COMPANY.rccm}, IFU {COMPANY.ifu}
        </li>
        <li>{COMPANY.address}</li>
        <li>{mail}</li>
      </ul>

      <h2>Données collectées</h2>
      <h3>Lorsque vous créez un compte</h3>
      <ul>
        <li>nom, adresse e-mail, numéro de téléphone, pays et ville ;</li>
        <li>
          mot de passe (conservé uniquement sous forme chiffrée) ou identifiant de connexion Google
          / Facebook si vous choisissez ce mode de connexion ;
        </li>
        <li>
          pour les agents : photo de profil, présentation, documents justificatifs transmis pour la
          vérification du compte (pièce d&apos;identité, carte professionnelle, RCCM…).
        </li>
      </ul>
      <h3>Lorsque vous utilisez le service</h3>
      <ul>
        <li>annonces publiées (description, prix, localisation, photos, documents du bien) ;</li>
        <li>
          messages, demandes de visite, demandes immobilières, alertes et avis que vous envoyez ;
        </li>
        <li>
          achats de jetons et historique des transactions (le paiement lui-même est traité par notre
          prestataire de paiement : nous ne recevons jamais vos coordonnées bancaires ou de mobile
          money complètes) ;
        </li>
        <li>
          données techniques de connexion (adresse IP, navigateur, pages consultées) utilisées pour
          la sécurité du service et la mesure d&apos;audience.
        </li>
      </ul>
      <h3>Lorsque vous nous écrivez</h3>
      <p>
        Les informations saisies dans le formulaire de contact ou de demande immobilière (nom,
        téléphone / WhatsApp, e-mail, message).
      </p>

      <h2>Finalités</h2>
      <ul>
        <li>créer et sécuriser votre compte, vous authentifier ;</li>
        <li>publier et modérer les annonces, vérifier l&apos;identité des agents immobiliers ;</li>
        <li>
          mettre en relation acheteurs, locataires, propriétaires et agents (messages, visites,
          déblocage des contacts) ;
        </li>
        <li>
          vous envoyer les notifications liées au service : codes de vérification, alertes de
          nouvelles annonces, réponses à vos demandes (e-mail, SMS ou WhatsApp) ;
        </li>
        <li>traiter les paiements et tenir la comptabilité ;</li>
        <li>mesurer l&apos;audience du site et améliorer le service ;</li>
        <li>prévenir la fraude et les abus, respecter nos obligations légales.</li>
      </ul>

      <h2>Base légale</h2>
      <p>
        Les traitements reposent sur l&apos;exécution du contrat qui vous lie à Habitat-Afrik
        (conditions générales d&apos;utilisation), sur notre intérêt légitime à sécuriser et
        améliorer le service, sur vos obligations et les nôtres en matière comptable et, pour la
        mesure d&apos;audience et les traceurs publicitaires, sur votre consentement.
      </p>

      <h2>Informations visibles par les autres utilisateurs</h2>
      <p>
        Le profil public d&apos;un agent (nom, photo, ville, présentation, annonces, avis) est
        visible de tous. Son numéro de téléphone n&apos;est communiqué qu&apos;aux utilisateurs
        connectés qui débloquent son contact. Les avis que vous publiez apparaissent avec votre nom.
      </p>

      <h2>Destinataires et prestataires</h2>
      <p>
        Les données sont destinées aux seules équipes habilitées de {COMPANY.name}. Elles ne sont ni
        vendues ni cédées à des tiers à des fins commerciales. Nous faisons appel aux prestataires
        techniques suivants, qui n&apos;agissent que sur nos instructions :
      </p>
      <ul>
        <li>hébergement du site et de la base de données : {HOST.name} (Canada) ;</li>
        <li>stockage et diffusion des photos et documents : Cloudflare (États-Unis) ;</li>
        <li>envoi des e-mails : Brevo (France) ;</li>
        <li>SMS et WhatsApp : Meta (WhatsApp Business) et notre opérateur SMS ;</li>
        <li>paiement des jetons : Bictorys et Moneroo (Afrique de l&apos;Ouest) ;</li>
        <li>
          connexion avec un compte Google ou Facebook : Google et Meta, uniquement si vous
          choisissez ce mode de connexion ;
        </li>
        <li>
          mesure d&apos;audience et publicité : Google Analytics, Google Tag Manager et Meta Pixel ;
        </li>
        <li>détection des erreurs techniques : Sentry ; cache et sécurité : Upstash.</li>
      </ul>
      <p>
        Certains de ces prestataires sont situés hors de votre pays de résidence ; nous ne retenons
        que des prestataires offrant des garanties de sécurité et de confidentialité reconnues.
      </p>

      <h2>Cookies et traceurs</h2>
      <ul>
        <li>
          <strong>Cookies nécessaires</strong> : maintien de votre session et protection contre les
          requêtes frauduleuses. Ils ne peuvent pas être désactivés sans empêcher la connexion.
        </li>
        <li>
          <strong>Mesure d&apos;audience et publicité</strong> : Google Analytics / Google Tag
          Manager et Meta Pixel nous permettent de connaître la fréquentation du site et
          l&apos;efficacité de nos campagnes. Vous pouvez les bloquer depuis les réglages de votre
          navigateur ou avec un module de blocage des traceurs.
        </li>
      </ul>

      <h2>Durée de conservation</h2>
      <ul>
        <li>compte et annonces : pendant toute la durée d&apos;utilisation du compte ;</li>
        <li>
          après la suppression du compte : suppression ou anonymisation, sauf les données que la loi
          nous impose de conserver (pièces comptables : 10 ans) ;
        </li>
        <li>
          messages envoyés via le formulaire de contact : 3 ans au plus après le dernier échange ;
        </li>
        <li>journaux techniques de sécurité : 12 mois au plus.</li>
      </ul>

      <h2>Vos droits</h2>
      <p>
        Conformément au Code du numérique de la République du Bénin et à la réglementation
        applicable dans votre pays, vous disposez d&apos;un droit d&apos;accès, de rectification,
        d&apos;effacement, de limitation et d&apos;opposition au traitement de vos données, ainsi
        que du droit de retirer votre consentement à tout moment. Vous pouvez modifier la plupart de
        vos informations depuis les paramètres de votre compte, ou exercer ces droits en écrivant à{' '}
        {mail}. Vous pouvez également introduire une réclamation auprès de l&apos;Autorité de
        Protection des Données Personnelles (APDP) du Bénin.
      </p>

      <h2>Sécurité</h2>
      <p>
        {COMPANY.name} met en œuvre des mesures techniques et organisationnelles raisonnables pour
        protéger les données contre tout accès, altération ou divulgation non autorisés : site servi
        intégralement en HTTPS, mots de passe chiffrés, accès restreints aux seules personnes
        habilitées.
      </p>

      <h2>Contact</h2>
      <p>
        Pour toute question relative à cette politique : {mail} —{' '}
        <a href={`tel:${COMPANY.phone.replace(/\s+/g, '')}`}>{COMPANY.phone}</a>.
      </p>
    </LegalPage>
  );
}
