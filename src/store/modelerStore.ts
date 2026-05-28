import { create } from 'zustand';
import * as THREE from 'three';
import { type PrimitiveType, type PrimitiveParams, buildPrimitive } from '@/lib/modeler/primitives';
import { type Modifier } from '@/lib/modeler/modifiers';
import { csg, type BooleanOp } from '@/lib/modeler/csg';

export type ObjectKind = 'primitive' | 'csg';

export interface SceneObject {
  id: string;
  name: string;
  /** Origin geometry. CSG results are baked but we keep `kind` for the outliner. */
  geometry: THREE.BufferGeometry;
  kind: ObjectKind;
  primitiveType?: PrimitiveType;
  primitiveParams?: PrimitiveParams;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  metalness: number;
  roughness: number;
  emissive: string;
  wireframe: boolean;
  /** Non-destructive modifier stack */
  modifiers: Modifier[];
}

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type EditMode = 'object' | 'vertex' | 'edge' | 'face';

let seq = 1;
const oid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

interface ModelerStore {
  objects: SceneObject[];
  selectedId: string | null;
  transformMode: TransformMode;
  editMode: EditMode;
  rev: number;

  addPrimitive: (type: PrimitiveType, params?: PrimitiveParams) => string;
  /** Drop a custom-geometry object (e.g. a PartsLib procedural part) into the scene */
  addCustomObject: (
    name: string,
    geometry: THREE.BufferGeometry,
    options?: Partial<Pick<SceneObject, 'color' | 'position' | 'rotation' | 'scale'>>,
  ) => string;
  select: (id: string | null) => void;
  setTransformMode: (m: TransformMode) => void;
  setEditMode: (m: EditMode) => void;
  setTransform: (
    id: string,
    patch: Partial<Pick<SceneObject, 'position' | 'rotation' | 'scale'>>,
  ) => void;
  setMaterial: (id: string, patch: Partial<Pick<SceneObject, 'color' | 'metalness' | 'roughness' | 'emissive' | 'wireframe'>>) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  duplicate: (id: string) => string | null;

  boolean: (aId: string, bId: string, op: BooleanOp) => string | null;
  addModifier: (id: string, mod: Modifier) => void;
  removeModifier: (id: string, idx: number) => void;
  updateModifier: (id: string, idx: number, mod: Modifier) => void;
  setObjects: (objs: SceneObject[]) => void;
  getMeshes: () => Promise<THREE.Mesh[]>;
}

const DEFAULT_COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#34d399', '#22d3ee'];
let colorIdx = 0;

function makeObject(
  name: string,
  geom: THREE.BufferGeometry,
  kind: ObjectKind,
  options: Partial<SceneObject> = {},
): SceneObject {
  return {
    id: oid('obj'),
    name,
    geometry: geom,
    kind,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: options.color ?? DEFAULT_COLORS[colorIdx++ % DEFAULT_COLORS.length],
    metalness: 0.2,
    roughness: 0.5,
    emissive: '#000000',
    wireframe: false,
    modifiers: [],
    ...options,
  };
}

export const useModelerStore = create<ModelerStore>((set, get) => ({
  objects: [],
  selectedId: null,
  transformMode: 'translate',
  editMode: 'object',
  rev: 0,

  addPrimitive: (type, params = {}) => {
    const geom = buildPrimitive(type, params);
    const name = `${type[0].toUpperCase()}${type.slice(1)} ${get().objects.length + 1}`;
    const obj = makeObject(name, geom, 'primitive', {
      primitiveType: type,
      primitiveParams: params,
    });
    set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id, rev: s.rev + 1 }));
    return obj.id;
  },

  addCustomObject: (name, geometry, options = {}) => {
    const obj = makeObject(name, geometry, 'primitive', options);
    set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id, rev: s.rev + 1 }));
    return obj.id;
  },

  select: (id) => set({ selectedId: id }),
  setTransformMode: (m) => set({ transformMode: m }),
  setEditMode: (m) => set({ editMode: m }),

  setTransform: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  setMaterial: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  rename: (id, name) =>
    set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...o, name } : o)) })),

  remove: (id) =>
    set((s) => {
      const target = s.objects.find((o) => o.id === id);
      target?.geometry.dispose();
      return {
        objects: s.objects.filter((o) => o.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        rev: s.rev + 1,
      };
    }),

  clear: () => {
    for (const o of get().objects) o.geometry.dispose();
    set({ objects: [], selectedId: null, rev: get().rev + 1 });
  },

  duplicate: (id) => {
    const o = get().objects.find((x) => x.id === id);
    if (!o) return null;
    const copy: SceneObject = {
      ...o,
      id: oid('obj'),
      name: o.name + ' Copy',
      geometry: o.geometry.clone(),
      position: [o.position[0] + 1, o.position[1], o.position[2]],
      modifiers: [...o.modifiers],
    };
    set((s) => ({ objects: [...s.objects, copy], selectedId: copy.id, rev: s.rev + 1 }));
    return copy.id;
  },

  boolean: (aId, bId, op) => {
    const a = get().objects.find((o) => o.id === aId);
    const b = get().objects.find((o) => o.id === bId);
    if (!a || !b) return null;
    const aMat = matrixOf(a);
    const bMat = matrixOf(b);
    try {
      const geom = csg(a.geometry, aMat, b.geometry, bMat, op);
      const name = `${a.name} ${op} ${b.name}`;
      const obj = makeObject(name, geom, 'csg', { color: a.color });
      // Dispose the source geometries — they're being replaced by the CSG result
      a.geometry.dispose();
      b.geometry.dispose();
      set((s) => ({
        objects: [...s.objects.filter((o) => o.id !== aId && o.id !== bId), obj],
        selectedId: obj.id,
        rev: s.rev + 1,
      }));
      return obj.id;
    } catch (err) {
      console.error('CSG failed', err);
      import('@/store/toastStore').then(({ toast }) =>
        toast.error('Boolean failed', (err as Error).message),
      );
      return null;
    }
  },

  addModifier: (id, mod) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id ? { ...o, modifiers: [...o.modifiers, mod] } : o,
      ),
      rev: s.rev + 1,
    })),
  removeModifier: (id, idx) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id ? { ...o, modifiers: o.modifiers.filter((_, i) => i !== idx) } : o,
      ),
      rev: s.rev + 1,
    })),
  updateModifier: (id, idx, mod) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id
          ? { ...o, modifiers: o.modifiers.map((m, i) => (i === idx ? mod : m)) }
          : o,
      ),
      rev: s.rev + 1,
    })),

  setObjects: (objs) => set({ objects: objs, selectedId: null, rev: get().rev + 1 }),

  getMeshes: async () => {
    const { objects } = get();
    return objects.map((o) => {
      const mesh = new THREE.Mesh(o.geometry, new THREE.MeshStandardMaterial({ color: o.color }));
      mesh.position.set(...o.position);
      mesh.rotation.set(...o.rotation);
      mesh.scale.set(...o.scale);
      mesh.updateMatrixWorld(true);
      return mesh;
    });
  },
}));

function matrixOf(o: SceneObject): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(...o.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...o.rotation)),
    new THREE.Vector3(...o.scale),
  );
  return m;
}
