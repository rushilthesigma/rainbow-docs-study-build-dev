import type { AppModule } from '@/os/types';
const registry = new Map<string, AppModule>();
export function getApp(id: string): AppModule | undefined { return registry.get(id); }
export function registerApp(mod: AppModule) { registry.set(mod.manifest.id, mod); }
