import { Browser } from '@capacitor/browser';
import { isNativeApp } from './platform';

export async function openExternalUrl(url) {
  if (!url) return;
  if (isNativeApp) {
    await Browser.open({ url, presentationStyle: 'popover' });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
