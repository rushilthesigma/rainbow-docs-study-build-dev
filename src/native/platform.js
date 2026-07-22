import { Capacitor } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();

export function isNativePlatform(platform) {
  return isNativeApp && Capacitor.getPlatform() === platform;
}
