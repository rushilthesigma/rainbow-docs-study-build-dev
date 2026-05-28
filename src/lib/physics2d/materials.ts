/**
 * Engineering material presets for PhysicsBench. Density is in kg/m² (since
 * everything's 2D — the engine uses density × area as mass). Restitution and
 * friction coefficients come from rough textbook values.
 */
export interface MaterialPreset {
  id: string;
  label: string;
  density: number;
  restitution: number;
  friction: number;
  color: string;
}

export const MATERIALS: MaterialPreset[] = [
  { id: 'steel', label: 'Steel', density: 7.85, restitution: 0.18, friction: 0.6, color: '#94a3b8' },
  { id: 'aluminum', label: 'Aluminum', density: 2.7, restitution: 0.20, friction: 0.5, color: '#cbd5e1' },
  { id: 'wood', label: 'Wood', density: 0.7, restitution: 0.30, friction: 0.55, color: '#a16207' },
  { id: 'plastic', label: 'Plastic', density: 1.05, restitution: 0.45, friction: 0.45, color: '#60a5fa' },
  { id: 'rubber', label: 'Rubber', density: 1.2, restitution: 0.85, friction: 0.95, color: '#1f2937' },
  { id: 'ice', label: 'Ice', density: 0.92, restitution: 0.10, friction: 0.05, color: '#bae6fd' },
  { id: 'glass', label: 'Glass', density: 2.5, restitution: 0.55, friction: 0.40, color: '#cffafe' },
  { id: 'concrete', label: 'Concrete', density: 2.4, restitution: 0.10, friction: 0.7, color: '#6b7280' },
  { id: 'foam', label: 'Foam', density: 0.05, restitution: 0.20, friction: 0.85, color: '#fde68a' },
  { id: 'bouncy', label: 'Super-Ball', density: 1.1, restitution: 0.95, friction: 0.85, color: '#ec4899' },
  { id: 'titanium', label: 'Titanium', density: 4.43, restitution: 0.22, friction: 0.55, color: '#b8c0c8' },
  { id: 'lead', label: 'Lead', density: 11.34, restitution: 0.05, friction: 0.45, color: '#475569' },
  { id: 'gold', label: 'Gold', density: 19.3, restitution: 0.08, friction: 0.4, color: '#d4af37' },
  { id: 'cork', label: 'Cork', density: 0.24, restitution: 0.45, friction: 0.7, color: '#b08456' },
  { id: 'stone', label: 'Stone', density: 2.7, restitution: 0.12, friction: 0.8, color: '#78716c' },
  { id: 'brick', label: 'Brick', density: 1.9, restitution: 0.10, friction: 0.75, color: '#b45309' },
  { id: 'sponge', label: 'Sponge', density: 0.1, restitution: 0.35, friction: 0.9, color: '#fbbf24' },
  { id: 'diamond', label: 'Diamond', density: 3.5, restitution: 0.30, friction: 0.2, color: '#a5f3fc' },
  { id: 'jelly', label: 'Jelly', density: 1.0, restitution: 0.9, friction: 0.98, color: '#f472b6' },
  { id: 'tungsten', label: 'Tungsten', density: 19.25, restitution: 0.15, friction: 0.5, color: '#64748b' },
  { id: 'balsa', label: 'Balsa Wood', density: 0.16, restitution: 0.25, friction: 0.6, color: '#fde68a' },
  { id: 'tire', label: 'Tire Rubber', density: 1.1, restitution: 0.7, friction: 1.1, color: '#111827' },
];

export function findMaterial(id: string): MaterialPreset | undefined {
  return MATERIALS.find((m) => m.id === id);
}
