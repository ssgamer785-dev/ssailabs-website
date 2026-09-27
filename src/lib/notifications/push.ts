import { supabase } from '../supabase';

export function supportsPush(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext
    && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    && typeof Notification.requestPermission === 'function';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64url.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function headers(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to enable notifications.');
  return { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' };
}

export async function registerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function subscribePush(): Promise<void> {
  if (!supportsPush() || Notification.permission !== 'granted') return;
  const registration = await registerWorker();
  if (!registration) return;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const res = await fetch('/api/push/public-key');
    if (!res.ok) throw new Error('Push notifications are not configured yet.');
    const { publicKey } = await res.json();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: keyBytes(publicKey),
    });
  }
  const res = await fetch('/api/push/subscribe', {
    method: 'POST', headers: await headers(), body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) throw new Error('Could not save this device for notifications.');
}

export async function unsubscribePush(): Promise<void> {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await fetch('/api/push/subscribe', {
      method: 'DELETE', headers: await headers(), body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    // The local endpoint must stop receiving this account's private alerts
    // even if the server is temporarily unreachable during sign-out.
    await subscription.unsubscribe();
  }
}
