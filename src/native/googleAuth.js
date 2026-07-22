import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { googleLogin } from '../api/auth';
import { isNativeApp } from './platform';

let initialization;

export function prepareNativeGoogleSignIn() {
  if (!isNativeApp) return Promise.resolve(false);
  if (!initialization) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    initialization = clientId
      ? GoogleSignIn.initialize({ clientId }).then(() => true)
      : Promise.reject(new Error('Native Google Sign-In is not configured.'));
  }
  return initialization;
}

export async function signInWithNativeGoogle() {
  await prepareNativeGoogleSignIn();
  const result = await GoogleSignIn.signIn();
  if (!result.idToken) throw new Error('Google did not return an identity token.');
  return googleLogin(result.idToken);
}

export async function signOutNativeGoogle() {
  if (!isNativeApp) return;
  await GoogleSignIn.signOut().catch(() => {});
}
