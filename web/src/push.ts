// Abonnement de cet appareil aux notifications (Web Push).
// Il faut une adresse sécurisée (https) et le service worker de l'appli (enregistré dans main.tsx).
import { api } from './api';
import { getUiLang } from './i18n';

export function pushSupported() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('sw.js');
}

// Clé publique du serveur (base64url) -> octets
function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a || a.byteLength !== b.length) return false;
  const bytes = new Uint8Array(a);
  return bytes.every((v, i) => v === b[i]);
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// Demande l'autorisation, abonne l'appareil (avec la clé actuelle du serveur) et l'enregistre côté serveur
export async function enablePush(publicKey: string) {
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const reg = await registration();
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.pushSubscribe(sub.toJSON(), getUiLang());
  return true;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

// Au démarrage : un appareil déjà abonné renvoie son abonnement, pour que le serveur ait la langue actuelle de
// l'interface et le bon compte
export async function refreshPushSubscription() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await api.pushSubscribe(sub.toJSON(), getUiLang()).catch(() => {});
}
