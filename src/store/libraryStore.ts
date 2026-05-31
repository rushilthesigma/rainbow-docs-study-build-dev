import { create } from 'zustand';
import * as THREE from 'three';

/** Serializable form of a BufferGeometry (positions/normals/index only). */
export interface GeomJSON {
  position: number[];
  normal?: number[];
  index?: number[];
}

export function geometryToJSON(geom: THREE.BufferGeometry): GeomJSON {
  const pos = geom.getAttribute('position');
  const nrm = geom.getAttribute('normal');
  const idx = geom.getIndex();
  return {
    position: Array.from(pos.array as Float32Array),
    normal: nrm ? Array.from(nrm.array as Float32Array) : undefined,
    index: idx ? Array.from(idx.array as ArrayLike<number>) : undefined,
  };
}

export function geometryFromJSON(j: GeomJSON): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(j.position, 3));
  if (j.index) g.setIndex(j.index);
  if (j.normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(j.normal, 3));
  else g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

export interface LibraryModel {
  id: string;
  name: string;
  /** ISO-ish created timestamp */
  createdAt: number;
  color: string;
  geom: GeomJSON;
}

const STORAGE_KEY = 'engos.library.v1';

function load(): LibraryModel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryModel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist(models: LibraryModel[]) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
    } catch {
      /* quota - geometry can be large; drop oldest on failure */
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(models.slice(-12)));
      } catch {
        /* give up */
      }
    }
  }, 300);
}

let seq = 1;
const uid = () => `lib-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface LibraryStore {
  models: LibraryModel[];
  save: (name: string, geom: THREE.BufferGeometry, color: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  get: (id: string) => LibraryModel | undefined;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  models: load(),
  save: (name, geom, color) => {
    const id = uid();
    const m: LibraryModel = {
      id,
      name: name || 'Untitled model',
      createdAt: Date.now(),
      color,
      geom: geometryToJSON(geom),
    };
    set((s) => {
      const models = [...s.models, m];
      persist(models);
      return { models };
    });
    return id;
  },
  rename: (id, name) =>
    set((s) => {
      const models = s.models.map((m) => (m.id === id ? { ...m, name } : m));
      persist(models);
      return { models };
    }),
  remove: (id) =>
    set((s) => {
      const models = s.models.filter((m) => m.id !== id);
      persist(models);
      return { models };
    }),
  get: (id) => get().models.find((m) => m.id === id),
}));
