// Textes des mentions légales et de la politique de confidentialité (page #legal), en français et en anglais.
// {publisher}, {contact} et {host} viennent de la configuration du serveur (LEGAL_PUBLISHER, LEGAL_CONTACT, LEGAL_HOST).
import type { UiLang } from './i18n';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export const LEGAL: Record<UiLang, { title: string; notSet: string; back: string; sections: LegalSection[] }> = {
  fr: {
    title: 'Mentions légales et confidentialité',
    notSet: 'non renseigné',
    back: 'Retour',
    sections: [
      {
        title: 'Mentions légales',
        bullets: [
          'Éditeur du site : {publisher}. Contact : {contact}.',
          'Hébergement : {host}.',
          'Application libre et gratuite (licence MIT), code source : https://github.com/suiris31/TCGC',
          "Site non officiel, sans lien avec Bandai, Shueisha, Toei Animation, Cardmarket ou TCGplayer. ONE PIECE CARD GAME et les visuels des cartes © Eiichiro Oda/Shueisha, Toei Animation, © BANDAI. Visuels : TCGplayer et site officiel ONE PIECE CARD GAME. Prix : fichiers publics de Cardmarket et de TCGplayer (via tcgcsv.com) ; ce sont des estimations indicatives, sans garantie.",
        ],
      },
      {
        title: 'Données enregistrées',
        bullets: [
          'Compte : pseudo, adresse e-mail, mot de passe (haché avec scrypt, jamais stocké en clair), date d\'inscription.',
          'Ce que tu saisis : collection, recherches et prix cibles, réglages (source des prix, exemplaires à garder, lien de partage, échanges, notifications), et ton contact et ta région si tu participes aux échanges.',
          "Notifications : l'adresse technique d'abonnement de ton navigateur, seulement si tu les actives.",
          "Technique : un cookie de session pour rester connecté, et l'adresse IP dans les journaux du serveur, pour sa sécurité.",
        ],
      },
      {
        title: 'Pourquoi',
        paragraphs: [
          "Uniquement pour faire fonctionner le service que tu utilises (compte, collection, estimations, alertes, partage, échanges) et le protéger (limitation des tentatives de connexion). Base légale : exécution du service demandé et intérêt légitime (sécurité).",
          "Pas de publicité, pas de mesure d'audience, pas de traceur, pas de revente. Le seul cookie est celui de session, indispensable à la connexion.",
        ],
      },
      {
        title: 'Qui voit quoi',
        paragraphs: [
          "Personne d'autre que toi, sauf ce que tu choisis de partager : la page de ton lien de partage (pseudo, cartes, recherches, et prix si tu le veux) et, si tu participes aux échanges, ton pseudo, ton contact, ta région et les cartes concernées, montrés aux participants avec qui un échange est possible. Ton adresse e-mail n'est jamais montrée.",
        ],
      },
      {
        title: 'Services tiers',
        bullets: [
          'Les notifications passent, chiffrées, par le service de notification de ton navigateur (Google, Mozilla, Apple...).',
          "Les grands visuels de cartes sont chargés depuis le serveur d'images de TCGplayer : ton navigateur lui transmet ton adresse IP.",
          "Les e-mails de mot de passe oublié passent par le service d'envoi d'e-mails de l'éditeur.",
        ],
      },
      {
        title: 'Durée de conservation',
        paragraphs: [
          "Tes données sont gardées tant que ton compte existe. « Supprimer mon compte » (onglet Profil) les efface immédiatement et définitivement ; elles disparaissent des sauvegardes du serveur au bout de 14 jours au plus. Les journaux du serveur sont gardés pour une durée limitée. Un lien de mot de passe oublié expire au bout d'1 heure.",
        ],
      },
      {
        title: 'Tes droits',
        paragraphs: [
          "Tu peux accéder à tes données, les corriger, les effacer, les récupérer (export CSV de ta collection dans l'onglet Stats) ou t'opposer à leur traitement : écris à {contact}. Tu peux aussi adresser une réclamation à la CNIL (cnil.fr).",
        ],
      },
    ],
  },
  en: {
    title: 'Legal notice and privacy',
    notSet: 'not provided',
    back: 'Back',
    sections: [
      {
        title: 'Legal notice',
        bullets: [
          'Publisher: {publisher}. Contact: {contact}.',
          'Hosting: {host}.',
          'Free and open-source app (MIT license), source code: https://github.com/suiris31/TCGC',
          'Unofficial site, not affiliated with Bandai, Shueisha, Toei Animation, Cardmarket or TCGplayer. ONE PIECE CARD GAME and card artwork © Eiichiro Oda/Shueisha, Toei Animation, © BANDAI. Images: TCGplayer and the official ONE PIECE CARD GAME site. Prices: public files from Cardmarket and TCGplayer (through tcgcsv.com); they are indicative estimates, with no guarantee.',
        ],
      },
      {
        title: 'Data stored',
        bullets: [
          'Account: username, email address, password (hashed with scrypt, never stored in plain text), sign-up date.',
          'What you enter: collection, wishlist and target prices, settings (price source, copies to keep, share link, trades, notifications), and your contact and region if you take part in trades.',
          "Notifications: your browser's technical subscription address, only if you enable them.",
          'Technical: a session cookie to keep you logged in, and the IP address in the server logs, for security.',
        ],
      },
      {
        title: 'Why',
        paragraphs: [
          'Only to run the service you use (account, collection, estimates, alerts, sharing, trades) and to protect it (limiting login attempts). Legal basis: providing the requested service and legitimate interest (security).',
          'No ads, no analytics, no trackers, no data selling. The only cookie is the session cookie, required to log in.',
        ],
      },
      {
        title: 'Who sees what',
        paragraphs: [
          'Nobody but you, except what you choose to share: your share link page (username, cards, wishlist, and prices if you want) and, if you take part in trades, your username, contact, region and the cards involved, shown to participants with whom a trade is possible. Your email address is never shown.',
        ],
      },
      {
        title: 'Third-party services',
        bullets: [
          "Notifications go, encrypted, through your browser's push service (Google, Mozilla, Apple...).",
          "Large card images are loaded from TCGplayer's image server: your browser sends it your IP address.",
          "Password reset emails go through the publisher's email provider.",
        ],
      },
      {
        title: 'Retention',
        paragraphs: [
          'Your data is kept as long as your account exists. "Delete my account" (Profile tab) erases it immediately and permanently; it disappears from the server backups within 14 days at most. Server logs are kept for a limited time. A password reset link expires after 1 hour.',
        ],
      },
      {
        title: 'Your rights',
        paragraphs: [
          'You can access, correct, erase or export your data (CSV export of your collection in the Stats tab) or object to its processing: write to {contact}. You can also file a complaint with your data protection authority (in France, the CNIL: cnil.fr).',
        ],
      },
    ],
  },
};
