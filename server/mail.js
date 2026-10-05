// Envoi d'e-mails (réinitialisation du mot de passe), configuré par variables d'environnement :
// - SMTP_URL : serveur d'envoi, ex. smtps://utilisateur:motdepasse@ssl0.ovh.net:465
//   ("log" : les e-mails sont écrits dans le journal au lieu d'être envoyés, pour essayer en local)
// - MAIL_FROM : expéditeur, ex. "Ma Collection <collection@exemple.fr>"
// - PUBLIC_URL : adresse publique de l'appli (ex. https://exemple.fr/tcgc/), pour les liens des e-mails.
//   Elle est fixée par la configuration et jamais déduite de la requête (un en-tête Host falsifié pourrait sinon
//   faire envoyer un lien vers un autre site).
import nodemailer from 'nodemailer';

const smtpUrl = process.env.SMTP_URL ?? '';
const logOnly = smtpUrl === 'log';

export const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/*$/, '/');

export function mailConfigured() {
  return Boolean(smtpUrl && process.env.PUBLIC_URL && (logOnly || process.env.MAIL_FROM));
}

let transport = null;
function getTransport() {
  transport ??= logOnly ? nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' }) : nodemailer.createTransport(smtpUrl);
  return transport;
}

export async function sendMail({ to, subject, text }) {
  const info = await getTransport().sendMail({ from: process.env.MAIL_FROM ?? 'TCGC <noreply@localhost>', to, subject, text });
  if (logOnly) console.log(`E-mail non envoyé (SMTP_URL=log) :\n${info.message.toString()}`);
}
