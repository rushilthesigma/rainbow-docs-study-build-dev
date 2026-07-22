import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNativeApp, isNativePlatform } from './platform';
import { openExternalUrl } from './browser';

export function initializeNativeRuntime() {
  if (!isNativeApp) return;

  document.documentElement.classList.add('native-app');
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
  if (isNativePlatform('android')) {
    StatusBar.setBackgroundColor({ color: '#0a0a14' }).catch(() => {});
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === window.location.origin) return;
    event.preventDefault();
    openExternalUrl(url.toString()).catch(() => {});
  });

  // Stripe checkout runs in the system browser. When the user returns to
  // the app, ask the existing billing sync route to refresh their plan.
  CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive || !localStorage.getItem('covalent-token')) return;
    import('../api/billing').then(({ syncBilling }) => syncBilling().catch(() => {}));
  });
}
