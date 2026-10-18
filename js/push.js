// Web Push for new-task and morning reminders. iOS allows push only for an app added to the Home Screen (16.4+).
import { VAPID_PUBLIC_KEY } from './config.js';
import { registerPush, dropPush } from './store.js';
import { S } from './strings.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

const keyBytes = b64 => Uint8Array.from(atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function pushState() {
  if (!pushSupported()) return isIos() ? 'install-first' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  return Notification.permission === 'granted' && sub ? 'on' : 'off';
}

export async function enablePush() {
  if (!VAPID_PUBLIC_KEY) throw new Error(S.pushNoKey);
  if ((await Notification.requestPermission()) !== 'granted') throw new Error(S.pushBlocked);
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const { endpoint, keys } = sub.toJSON();
  await registerPush({ p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

export async function disablePush() {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) return;
  await dropPush(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
