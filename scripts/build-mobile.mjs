import { spawnSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';

const env = loadEnv('mobile', process.cwd(), '');
const apiBase = env.VITE_API_BASE_URL?.trim();

if (!apiBase) {
  console.error('Missing VITE_API_BASE_URL. Copy .env.mobile.example to .env.mobile.local and set the deployed API origin.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(apiBase);
} catch {
  console.error(`VITE_API_BASE_URL is not a valid URL: ${apiBase}`);
  process.exit(1);
}

if (parsed.protocol !== 'https:' && env.VITE_NATIVE_ALLOW_HTTP !== 'true') {
  console.error('VITE_API_BASE_URL must use HTTPS. Set VITE_NATIVE_ALLOW_HTTP=true only for local device development.');
  process.exit(1);
}

if (!env.VITE_GOOGLE_CLIENT_ID?.trim()) {
  console.error('Missing VITE_GOOGLE_CLIENT_ID. Native Google Sign-In needs the existing web OAuth client ID.');
  process.exit(1);
}

const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', 'build', '--config', 'vite.mobile.config.js', '--mode', 'mobile'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.status === 0) {
  renameSync(resolve('dist/mobile.html'), resolve('dist/index.html'));
}

process.exit(result.status ?? 1);
