// At-rest encryption for account emails.
//
// Emails are PII and are the one obviously-sensitive value sitting in
// plaintext in users.json / sessions.json, where anyone who can read the
// data files (a leaked backup, a snooped disk, a shared host) can just grep
// them out. This module encrypts them on the way to disk and decrypts on
// the way back, so:
//   - on disk    -> opaque ciphertext, useless without the key
//   - in memory  -> plaintext, so the ~200 `users[email]` call sites and the
//                   admin panel keep working with zero other changes
// The key lives ONLY on the server (env var, or a 0600 file in the data
// dir). It is never sent to a browser, so an admin request - which is served
// by this same server - can decrypt and show real emails, while nobody
// inspecting the client, the network, or the files ever sees them.
//
// AES-256-GCM with a random IV per value: authenticated (tamper-evident)
// and non-deterministic. We fully decrypt on load, so determinism isn't
// needed even though emails double as object keys.

import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';

const PREFIX = 'enc.v1.';
const ALGO = 'aes-256-gcm';

let keyBuf = null;

// Accept a 32-byte key as base64 or hex; anything else is hashed to 32 bytes
// so an operator can set EMAIL_ENC_KEY to an arbitrary passphrase.
function normalizeKey(raw) {
  const s = String(raw).trim();
  for (const enc of ['base64', 'hex']) {
    try {
      const b = Buffer.from(s, enc);
      if (b.length === 32) return b;
    } catch { /* try next */ }
  }
  return crypto.createHash('sha256').update(s).digest();
}

// Call once at boot. Precedence: explicit env key, else a persisted random
// key in the data dir (created on first run, chmod 600). The persisted file
// is what lets the server decrypt across restarts without an env var; it
// must never be committed - see .gitignore.
export function initEmailCrypto(dataDir) {
  const envKey = process.env.EMAIL_ENC_KEY || process.env.DATA_ENC_KEY;
  if (envKey) {
    keyBuf = normalizeKey(envKey);
    console.log('emailCrypto: using key from EMAIL_ENC_KEY env var');
    return;
  }
  const keyPath = join(dataDir, '.email-enc-key');
  try {
    if (existsSync(keyPath)) {
      keyBuf = normalizeKey(readFileSync(keyPath, 'utf-8'));
      console.log(`emailCrypto: using persisted key file ${keyPath} (set EMAIL_ENC_KEY to pin it)`);
      return;
    }
    keyBuf = crypto.randomBytes(32);
    writeFileSync(keyPath, keyBuf.toString('base64'), { mode: 0o600 });
    try { chmodSync(keyPath, 0o600); } catch { /* best effort on non-posix */ }
    // A brand-new key means any PREVIOUSLY encrypted data is unreadable. On
    // a host with an ephemeral disk (Render without a persistent volume)
    // this happens on EVERY deploy - the fix is an env var, so shout.
    console.warn(
      'emailCrypto: GENERATED a new key at ' + keyPath + '. If existing data fails to '
      + 'decrypt, the old key was lost (ephemeral disk?). Set EMAIL_ENC_KEY in the '
      + 'environment to this file\'s value so the key survives redeploys.'
    );
  } catch (e) {
    // If the data dir is unwritable, fall back to an in-process ephemeral
    // key so the app still boots. Data written this run won't decrypt after
    // a restart, but that's strictly better than crashing on startup.
    console.error('emailCrypto: could not persist key, using ephemeral:', e.message);
    keyBuf = keyBuf || crypto.randomBytes(32);
  }
}

export function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(PREFIX);
}

export function encryptEmail(plain) {
  if (plain == null || plain === '') return plain;
  if (!keyBuf || isEncrypted(plain)) return plain; // no key, or already done
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBuf, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // base64 has no '.', so '.' is a safe field separator.
  return PREFIX + [iv, tag, ct].map(b => b.toString('base64')).join('.');
}

export function decryptEmail(token) {
  if (!keyBuf || !isEncrypted(token)) return token; // plaintext passthrough (pre-migration)
  try {
    const [, , ivB64, tagB64, ctB64] = token.split('.');
    const decipher = crypto.createDecipheriv(ALGO, keyBuf, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('emailCrypto: decrypt failed, leaving value as-is:', e.message);
    return token;
  }
}

// ---- whole-store transforms (memory <-> disk) ----
// Memory is keyed by plaintext email; disk is keyed by ciphertext. Only the
// map key and the record's own `email` field are touched - everything else
// is copied through untouched.

export function encryptUsersForDisk(users) {
  const out = {};
  for (const [email, rec] of Object.entries(users || {})) {
    const encRec = { ...rec };
    if (encRec.email != null && encRec.email !== '') encRec.email = encryptEmail(encRec.email);
    out[encryptEmail(email)] = encRec;
  }
  return out;
}

export function decryptUsersFromDisk(raw) {
  const out = {};
  for (const [key, rec] of Object.entries(raw || {})) {
    const decRec = { ...rec };
    if (decRec.email != null && decRec.email !== '') decRec.email = decryptEmail(decRec.email);
    out[decryptEmail(key)] = decRec;
  }
  return out;
}

// sessions.json is keyed by opaque token; only the `email` field is PII.
export function encryptSessionsForDisk(sessions) {
  const out = {};
  for (const [token, rec] of Object.entries(sessions || {})) {
    const encRec = { ...rec };
    if (encRec.email != null && encRec.email !== '') encRec.email = encryptEmail(encRec.email);
    out[token] = encRec;
  }
  return out;
}

export function decryptSessionsFromDisk(raw) {
  const out = {};
  for (const [token, rec] of Object.entries(raw || {})) {
    const decRec = { ...rec };
    if (decRec.email != null && decRec.email !== '') decRec.email = decryptEmail(decRec.email);
    out[token] = decRec;
  }
  return out;
}
