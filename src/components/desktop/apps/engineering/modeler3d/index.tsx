import { useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  Circle as CircleIcon,
  Cylinder,
  Cone,
  Disc3,
  Square,
  Trash2,
  Copy,
  Layers,
  MousePointer2,
  Move3D,
  RotateCw,
  Maximize2,
  Eye,
  EyeOff,
  Plus,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  PenLine,
  X as XIcon,
  Undo2,
  Save,
} from 'lucide-react';
import * as THREE from 'three';
import type { AppModule } from '@/os/types';
import ModelerViewport from './Viewport';
import { useModelerStore, type SceneObject } from '@/store/modelerStore';
import type { PrimitiveType } from '@/lib/modeler/primitives';
import type { Modifier, ModifierKind } from '@/lib/modeler/modifiers';
import { useAppTools } from '@/hooks/useToolRegistry';
import { publishAppState } from '@/ai/screenScanner';
import { downloadBlob, toASCIISTL, toBinarySTL, toOBJ } from '@/lib/modeler/exporters';
import { extrudePolygon } from '@/lib/modeler/primitives';
import { ModelerIcon, AeroIcon } from '@/apps/icons';

function Modeler3D({ appId }: { appId: string }) {
  const objects = useModelerStore((s) => s.objects);
  const selectedId = useModelerStore((s) => s.selectedId);
  const transformMode = useModelerStore((s) => s.transformMode);
  const setTransformMode = useModelerStore((s) => s.setTransformMode);
  const select = useModelerStore((s) => s.select);
  const addPrimitive = useModelerStore((s) => s.addPrimitive);
  const remove = useModelerStore((s) => s.remove);
  const duplicate = useModelerStore((s) => s.duplicate);
  const boolean = useModelerStore((s) => s.boolean);
  const setMaterial = useModelerStore((s) => s.setMaterial);
  const setTransform = useModelerStore((s) => s.setTransform);
  const rename = useModelerStore((s) => s.rename);
  const addModifier = useModelerStore((s) => s.addModifier);
  const removeModifier = useModelerStore((s) => s.removeModifier);
  const updateModifier = useModelerStore((s) => s.updateModifier);
  const clear = useModelerStore((s) => s.clear);

  const selected = useMemo(
    () => (selectedId ? objects.find((o) => o.id === selectedId) ?? null : null),
    [objects, selectedId],
  );

  // Keyboard shortcuts: 1/2/3 = edit mode, G/R/S = transform
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'g') setTransformMode('translate');
      else if (e.key.toLowerCase() === 'r') setTransformMode('rotate');
      else if (e.key.toLowerCase() === 's') setTransformMode('scale');
      else if (e.key === 'Delete' && selectedId) remove(selectedId);
      else if (e.key.toLowerCase() === 'd' && (e.metaKey || e.ctrlKey) && selectedId) {
        e.preventDefault();
        duplicate(selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, remove, duplicate, setTransformMode]);

  // Publish state for AI scanner
  useEffect(() => {
    return publishAppState(appId, () => ({
      summary: `Modeler3D has ${objects.length} object(s). Transform: ${transformMode}. ${selected ? `Selected: ${selected.name} (${selected.kind})` : 'No selection.'}`,
      state: {
        objects: objects.map((o) => ({
          id: o.id,
          name: o.name,
          kind: o.kind,
          primitiveType: o.primitiveType,
          position: o.position,
          rotation: o.rotation,
          scale: o.scale,
          color: o.color,
          modifiers: o.modifiers,
        })),
        selectedId,
      },
    }));
  }, [appId, objects, selectedId, transformMode, selected]);

  // AI tools
  useAppTools(appId, [
    {
      toolName: 'add_primitive',
      description:
        'Add a primitive shape. type: box | sphere | cylinder | cone | torus | plane. params: optional {size, radius, height, width, depth, tube, segments}. Returns the object id.',
      input_schema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'] },
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
          size: { type: 'number' },
          radius: { type: 'number' },
          height: { type: 'number' },
          width: { type: 'number' },
          depth: { type: 'number' },
          tube: { type: 'number' },
          segments: { type: 'number' },
          color: { type: 'string' },
        },
        required: ['type'],
      },
      handler: ({ type, x, y, z, color, ...rest }: any) => {
        const id = addPrimitive(type as PrimitiveType, rest);
        setTransform(id, {
          position: [Number(x ?? 0), Number(y ?? 0), Number(z ?? 0)],
        });
        if (color) setMaterial(id, { color: String(color) });
        return { id };
      },
    },
    {
      toolName: 'transform',
      description: 'Set position / rotation (radians, XYZ) / scale of an object.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          position: { type: 'array' },
          rotation: { type: 'array' },
          scale: { type: 'array' },
        },
        required: ['id'],
      },
      handler: ({ id, position, rotation, scale }: any) => {
        const patch: any = {};
        if (position) patch.position = position.map(Number) as [number, number, number];
        if (rotation) patch.rotation = rotation.map(Number) as [number, number, number];
        if (scale) patch.scale = scale.map(Number) as [number, number, number];
        setTransform(String(id), patch);
        return { ok: true };
      },
    },
    {
      toolName: 'boolean_op',
      description:
        'Combine two objects: union (a + b), subtract (a − b), intersect (a ∩ b). Returns the id of the resulting object; the two source objects are removed.',
      input_schema: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          op: { type: 'string', enum: ['union', 'subtract', 'intersect'] },
        },
        required: ['a', 'b', 'op'],
      },
      handler: ({ a, b, op }: any) => {
        const id = boolean(String(a), String(b), op);
        if (!id) throw new Error('Boolean op failed');
        return { id };
      },
    },
    {
      toolName: 'set_material',
      description: 'Set color/metalness/roughness/emissive on an object.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          color: { type: 'string' },
          metalness: { type: 'number' },
          roughness: { type: 'number' },
          emissive: { type: 'string' },
        },
        required: ['id'],
      },
      handler: ({ id, color, metalness, roughness, emissive }: any) => {
        const patch: any = {};
        if (color !== undefined) patch.color = color;
        if (metalness !== undefined) patch.metalness = Number(metalness);
        if (roughness !== undefined) patch.roughness = Number(roughness);
        if (emissive !== undefined) patch.emissive = emissive;
        setMaterial(String(id), patch);
        return { ok: true };
      },
    },
    {
      toolName: 'add_modifier',
      description:
        'Push a modifier onto an object: mirror{axis: x|y|z}, array{count, offset:[x,y,z]}, solidify{thickness}, subsurf{iterations}.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          modifier: { type: 'object' },
        },
        required: ['id', 'modifier'],
      },
      handler: ({ id, modifier }: any) => {
        addModifier(String(id), modifier as Modifier);
        return { ok: true };
      },
    },
    {
      toolName: 'remove_object',
      description: 'Delete an object from the scene.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      handler: ({ id }: any) => {
        remove(String(id));
        return { ok: true };
      },
    },
    {
      toolName: 'clear_scene',
      description: 'Remove every object.',
      input_schema: { type: 'object', properties: {} },
      handler: () => {
        clear();
        return { ok: true };
      },
    },
    {
      toolName: 'generate_model',
      description:
        'Build a small model from a list of primitives and boolean ops. primitives: [{key, type, position?, rotation?, scale?, params?, color?}]. ops: [{a, b, op}] where a,b are keys. Returns the final object ids.',
      input_schema: {
        type: 'object',
        properties: {
          primitives: { type: 'array' },
          ops: { type: 'array' },
        },
        required: ['primitives'],
      },
      handler: ({ primitives, ops }: any) => {
        const keyMap = new Map<string, string>();
        for (const p of primitives ?? []) {
          const id = addPrimitive(p.type as PrimitiveType, p.params ?? {});
          if (p.position) setTransform(id, { position: p.position });
          if (p.rotation) setTransform(id, { rotation: p.rotation });
          if (p.scale) setTransform(id, { scale: p.scale });
          if (p.color) setMaterial(id, { color: p.color });
          if (p.key) keyMap.set(p.key, id);
        }
        for (const o of ops ?? []) {
          const aid = keyMap.get(o.a) ?? o.a;
          const bid = keyMap.get(o.b) ?? o.b;
          const id = boolean(aid, bid, o.op);
          if (id) keyMap.set(`${o.a}_${o.op}_${o.b}`, id);
        }
        return { ids: Array.from(keyMap.values()) };
      },
    },
  ]);

  const exportFile = (format: 'obj' | 'stl' | 'stl-bin' | 'gltf') => {
    const meshes = objects.map((o) => {
      const m = new THREE.Mesh(o.geometry, new THREE.MeshStandardMaterial({ color: o.color }));
      m.position.set(...o.position);
      m.rotation.set(...o.rotation);
      m.scale.set(...o.scale);
      m.updateMatrixWorld(true);
      return m;
    });
    if (!meshes.length) return;
    if (format === 'obj') downloadBlob('model.obj', toOBJ(meshes), 'text/plain');
    else if (format === 'stl') downloadBlob('model.stl', toASCIISTL(meshes), 'model/stl');
    else if (format === 'stl-bin') downloadBlob('model.stl', toBinarySTL(meshes), 'model/stl');
    else if (format === 'gltf') {
      // dynamic import to avoid a hard dep on three's GLTFExporter at boot
      import('three/examples/jsm/exporters/GLTFExporter.js').then(({ GLTFExporter }) => {
        const scene = new THREE.Scene();
        meshes.forEach((m) => scene.add(m));
        new GLTFExporter().parse(
          scene,
          (result) => {
            const json = typeof result === 'string' ? result : JSON.stringify(result);
            downloadBlob('model.gltf', json, 'model/gltf+json');
          },
          (err) => {
            import('@/store/toastStore').then(({ toast }) =>
              toast.error('GLTF export failed', err.message),
            );
          },
          { binary: false },
        );
      });
    }
  };

  return (
    <div className="flex h-full">
      {/* Left tool rail */}
      <div className="w-12 shrink-0 border-r border-white/10 bg-black/25 flex flex-col items-center py-2 gap-1 chrome">
        <ToolBtn
          active={!selectedId}
          title="Deselect"
          onClick={() => select(null)}
        >
          <MousePointer2 size={15} />
        </ToolBtn>
        <ToolBtn
          active={transformMode === 'translate'}
          title="Move (G)"
          onClick={() => setTransformMode('translate')}
        >
          <Move3D size={15} />
        </ToolBtn>
        <ToolBtn
          active={transformMode === 'rotate'}
          title="Rotate (R)"
          onClick={() => setTransformMode('rotate')}
        >
          <RotateCw size={15} />
        </ToolBtn>
        <ToolBtn
          active={transformMode === 'scale'}
          title="Scale (S)"
          onClick={() => setTransformMode('scale')}
        >
          <Maximize2 size={15} />
        </ToolBtn>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top toolbar */}
        <div className="h-8 flex items-center px-2 gap-1 border-b border-white/10 chrome">
          <PrimitiveMenu onAdd={addPrimitive} />
          <BooleanMenu />
          <SketchButton />
          <PresetMenu3D />
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => {
                const obj = selected ?? objects[objects.length - 1];
                if (!obj) {
                  import('@/store/toastStore').then(({ toast }) =>
                    toast.warn('Nothing to save', 'Add or select an object first.'),
                  );
                  return;
                }
                Promise.all([
                  import('@/store/libraryStore'),
                  import('@/store/toastStore'),
                ]).then(([lib, t]) => {
                  // Bake the object's transform into the saved geometry.
                  const g = obj.geometry.clone();
                  const m = new THREE.Matrix4().compose(
                    new THREE.Vector3(...obj.position),
                    new THREE.Quaternion().setFromEuler(new THREE.Euler(...obj.rotation)),
                    new THREE.Vector3(...obj.scale),
                  );
                  g.applyMatrix4(m);
                  lib.useLibraryStore.getState().save(obj.name, g, obj.color);
                  t.toast.success('Saved to Library', `"${obj.name}" is now in PartsLib → My Library.`);
                });
              }}
              title="Save the selected object to your reusable Library"
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
            >
              <Save size={12} /> Save to Library
            </button>
            <button
              onClick={() => {
                const obj = selected ?? objects[objects.length - 1];
                if (!obj) {
                  import('@/store/toastStore').then(({ toast }) =>
                    toast.warn('Nothing to send', 'Add or select an object first.'),
                  );
                  return;
                }
                Promise.all([
                  import('@/lib/cfd/customShape'),
                  import('@/store/aerosimStore'),
                  import('@/store/windowStore'),
                  import('@/store/toastStore'),
                ]).then(([cs, aero, win, t]) => {
                  const sil = cs.extractSilhouette(obj.geometry);
                  if (sil.length < 3) {
                    t.toast.error('Send failed', 'That object has no usable cross-section.');
                    return;
                  }
                  aero.useAerosimStore.getState().setImported({
                    name: obj.name,
                    silhouette: sil,
                    geometry: obj.geometry.clone(),
                  });
                  win.useWindowStore.getState().openApp('aerosim', { title: 'AeroSim' });
                  t.toast.success('Sent to AeroSim', `Testing "${obj.name}" in the wind.`);
                });
              }}
              title="Test the selected object in AeroSim"
              className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
            >
              <AeroIcon size={13} /> AeroSim
            </button>
            <ImportObjButton />
            <ExportMenu onExport={exportFile} />
            <button
              onClick={clear}
              title="Clear scene"
              className="p-1 rounded hover:bg-white/10"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          <ModelerViewport />
        </div>
      </div>

      {/* Right column: outliner + properties */}
      <div className="w-64 shrink-0 border-l border-white/10 bg-black/25 flex flex-col chrome">
        <div className="border-b border-white/10 max-h-56 overflow-y-auto">
          <div className="text-[10px] uppercase text-white/45 px-3 pt-2 pb-1">Outliner</div>
          {!objects.length && (
            <div className="px-3 py-2 text-xs text-white/45">No objects</div>
          )}
          {objects.map((o) => (
            <button
              key={o.id}
              onClick={() => select(o.id)}
              className={`w-full text-left px-3 py-1 text-xs flex items-center gap-1.5 ${
                o.id === selectedId ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              <span
                className="w-2 h-2 rounded-sm"
                style={{ background: o.color }}
              />
              <span className="truncate flex-1">{o.name}</span>
              <span className="text-[10px] text-white/40">{o.kind}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="text-[10px] uppercase text-white/45 mb-1">Properties</div>
          {!selected ? (
            <div className="text-xs text-white/45">Select an object</div>
          ) : (
            <ObjectProperties
              obj={selected}
              onRename={(n) => rename(selected.id, n)}
              onTransform={(p) => setTransform(selected.id, p)}
              onMaterial={(p) => setMaterial(selected.id, p)}
              onDuplicate={() => duplicate(selected.id)}
              onDelete={() => remove(selected.id)}
              onAddModifier={(mod) => addModifier(selected.id, mod)}
              onUpdateModifier={(i, m) => updateModifier(selected.id, i, m)}
              onRemoveModifier={(i) => removeModifier(selected.id, i)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PrimitiveMenu({ onAdd }: { onAdd: (t: PrimitiveType) => void }) {
  const [open, setOpen] = useState(false);
  const items: { type: PrimitiveType; icon: any; label: string }[] = [
    { type: 'box', icon: Box, label: 'Cube' },
    { type: 'sphere', icon: CircleIcon, label: 'Sphere' },
    { type: 'cylinder', icon: Cylinder, label: 'Cylinder' },
    { type: 'cone', icon: Cone, label: 'Cone' },
    { type: 'torus', icon: Disc3, label: 'Torus' },
    { type: 'plane', icon: Square, label: 'Plane' },
    { type: 'capsule', icon: CircleIcon, label: 'Capsule' },
    { type: 'torusKnot', icon: Disc3, label: 'Torus Knot' },
    { type: 'tetrahedron', icon: Box, label: 'Tetrahedron' },
    { type: 'octahedron', icon: Box, label: 'Octahedron' },
    { type: 'icosahedron', icon: Box, label: 'Icosahedron' },
    { type: 'dodecahedron', icon: Box, label: 'Dodecahedron' },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
      >
        <Plus size={12} /> Add
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 glass-strong rounded-md py-1 min-w-[140px] z-20 shadow-window">
          {items.map((it) => (
            <button
              key={it.type}
              onClick={() => {
                onAdd(it.type);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-white/10 text-left"
            >
              <it.icon size={13} className="text-white/80" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BooleanMenu() {
  const objects = useModelerStore((s) => s.objects);
  const boolean = useModelerStore((s) => s.boolean);
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
      >
        <Layers size={12} /> Boolean
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 glass-strong rounded-md p-2 w-60 z-20 shadow-window text-[11px] space-y-1.5">
          <div className="text-white/55">Combine two objects:</div>
          <select
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 outline-none text-xs"
          >
            <option value="">A…</option>
            {objects.map((o) => (
              <option key={o.id} value={o.id} className="bg-zinc-800">
                {o.name}
              </option>
            ))}
          </select>
          <select
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-md px-1.5 py-1 outline-none text-xs"
          >
            <option value="">B…</option>
            {objects.map((o) => (
              <option key={o.id} value={o.id} className="bg-zinc-800">
                {o.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-1">
            {(['union', 'subtract', 'intersect'] as const).map((op) => (
              <button
                key={op}
                disabled={!a || !b || a === b}
                onClick={() => {
                  boolean(a, b, op);
                  setOpen(false);
                }}
                className="px-1 py-1 rounded-md bg-accent/85 hover:bg-accent text-white text-[11px] disabled:opacity-40"
              >
                {op}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ImportObjButton() {
  const ref = useRef<HTMLInputElement>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const [{ parseOBJ, parseSTL }, t] = await Promise.all([
        import('@/lib/cfd/customShape'),
        import('@/store/toastStore'),
      ]);
      const ext = f.name.toLowerCase().split('.').pop();
      const geom =
        ext === 'stl' ? parseSTL(await f.arrayBuffer()) : parseOBJ(await f.text());
      if (!geom.getAttribute('position') || geom.getAttribute('position').count < 3) {
        t.toast.error('Import failed', 'No geometry found in that file.');
        return;
      }
      geom.center();
      useModelerStore
        .getState()
        .addCustomObject(f.name.replace(/\.(obj|stl)$/i, ''), geom, { color: '#9aa6b8' });
      t.toast.success('Imported', f.name);
    } catch (err) {
      const { toast } = await import('@/store/toastStore');
      toast.error('Import failed', (err as Error).message);
    } finally {
      e.target.value = '';
    }
  };
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
        title="Import a CAD mesh (.obj or .stl) into the scene"
      >
        <Upload size={12} /> Import
      </button>
      <input ref={ref} type="file" accept=".obj,.stl" hidden onChange={onFile} />
    </>
  );
}

function ExportMenu({ onExport }: { onExport: (f: 'obj' | 'stl' | 'stl-bin' | 'gltf') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10"
      >
        <Download size={12} /> Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 glass-strong rounded-md py-1 min-w-[140px] z-20 shadow-window">
          {(['obj', 'stl', 'stl-bin', 'gltf'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                onExport(f);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-white/10"
            >
              {f === 'stl-bin' ? 'STL (binary)' : f.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectProperties({
  obj,
  onRename,
  onTransform,
  onMaterial,
  onDuplicate,
  onDelete,
  onAddModifier,
  onUpdateModifier,
  onRemoveModifier,
}: {
  obj: SceneObject;
  onRename: (n: string) => void;
  onTransform: (p: Partial<Pick<SceneObject, 'position' | 'rotation' | 'scale'>>) => void;
  onMaterial: (p: any) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddModifier: (m: Modifier) => void;
  onUpdateModifier: (i: number, m: Modifier) => void;
  onRemoveModifier: (i: number) => void;
}) {
  const [matOpen, setMatOpen] = useState(true);
  const [trOpen, setTrOpen] = useState(true);
  const [modOpen, setModOpen] = useState(true);
  return (
    <div className="space-y-3 text-xs">
      <input
        value={obj.name}
        onChange={(e) => onRename(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1 outline-none text-white"
      />

      <Section label="Transform" open={trOpen} onToggle={() => setTrOpen((o) => !o)}>
        <Vec3Row
          label="pos"
          value={obj.position}
          onChange={(v) => onTransform({ position: v })}
          step={0.1}
        />
        <Vec3Row
          label="rot"
          value={obj.rotation}
          onChange={(v) => onTransform({ rotation: v })}
          step={0.1}
        />
        <Vec3Row
          label="scl"
          value={obj.scale}
          onChange={(v) => onTransform({ scale: v })}
          step={0.1}
        />
      </Section>

      <Section label="Material" open={matOpen} onToggle={() => setMatOpen((o) => !o)}>
        <div className="flex items-center gap-2">
          <div className="w-10 text-white/55">color</div>
          <input
            type="color"
            value={obj.color}
            onChange={(e) => onMaterial({ color: e.target.value })}
            className="w-8 h-6 bg-transparent rounded"
          />
        </div>
        <NumRow
          label="metal"
          value={obj.metalness}
          onChange={(v) => onMaterial({ metalness: v })}
          step={0.05}
          min={0}
          max={1}
        />
        <NumRow
          label="rough"
          value={obj.roughness}
          onChange={(v) => onMaterial({ roughness: v })}
          step={0.05}
          min={0}
          max={1}
        />
        <div className="flex items-center gap-2">
          <div className="w-10 text-white/55">emit</div>
          <input
            type="color"
            value={obj.emissive}
            onChange={(e) => onMaterial({ emissive: e.target.value })}
            className="w-8 h-6 bg-transparent rounded"
          />
        </div>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={obj.wireframe}
            onChange={(e) => onMaterial({ wireframe: e.target.checked })}
          />
          wireframe
        </label>
      </Section>

      <Section label="Modifiers" open={modOpen} onToggle={() => setModOpen((o) => !o)}>
        {obj.modifiers.map((m, i) => (
          <ModifierEditor
            key={i}
            mod={m}
            onUpdate={(nm) => onUpdateModifier(i, nm)}
            onRemove={() => onRemoveModifier(i)}
          />
        ))}
        <AddModifier onAdd={onAddModifier} />
      </Section>

      <div className="flex gap-1.5">
        <button
          onClick={onDuplicate}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-white/10 hover:bg-white/15"
        >
          <Copy size={11} /> Dup
        </button>
        <button
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md bg-traffic-red/20 hover:bg-traffic-red/40 text-traffic-red"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </div>
  );
}

function Section({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-black/15 border border-white/8">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wide text-white/55"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {label}
      </button>
      {open && <div className="p-2 space-y-1.5 border-t border-white/8">{children}</div>}
    </div>
  );
}

function Vec3Row({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
  step: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-7 text-white/55">{label}</div>
      {[0, 1, 2].map((i) => (
        <input
          key={i}
          type="number"
          value={value[i]}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) {
              const next = [...value] as [number, number, number];
              next[i] = v;
              onChange(next);
            }
          }}
          className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-1 py-0.5 font-mono text-xs outline-none"
        />
      ))}
    </div>
  );
}

function NumRow({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-10 text-white/55">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="font-mono w-8 text-right">{value.toFixed(2)}</span>
    </div>
  );
}

function ModifierEditor({
  mod,
  onUpdate,
  onRemove,
}: {
  mod: Modifier;
  onUpdate: (m: Modifier) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded bg-white/5 p-1.5 space-y-1 border border-white/8">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-accent">{mod.kind}</span>
        <button onClick={onRemove} className="text-white/55 hover:text-white">
          <Trash2 size={10} />
        </button>
      </div>
      {mod.kind === 'mirror' && (
        <div className="flex items-center gap-1">
          {(['x', 'y', 'z'] as const).map((ax) => (
            <button
              key={ax}
              onClick={() => onUpdate({ kind: 'mirror', axis: ax })}
              className={`flex-1 py-0.5 rounded ${
                mod.axis === ax ? 'bg-accent text-white' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {ax}
            </button>
          ))}
        </div>
      )}
      {mod.kind === 'array' && (
        <>
          <NumRow
            label="count"
            value={mod.count}
            min={1}
            max={16}
            step={1}
            onChange={(v) => onUpdate({ ...mod, count: Math.round(v) })}
          />
          <Vec3Row
            label="offset"
            value={mod.offset}
            onChange={(v) => onUpdate({ ...mod, offset: v })}
            step={0.1}
          />
        </>
      )}
      {mod.kind === 'solidify' && (
        <NumRow
          label="thick"
          value={mod.thickness}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(v) => onUpdate({ ...mod, thickness: v })}
        />
      )}
      {mod.kind === 'subsurf' && (
        <NumRow
          label="iter"
          value={mod.iterations}
          min={1}
          max={3}
          step={1}
          onChange={(v) => onUpdate({ ...mod, iterations: Math.round(v) })}
        />
      )}
    </div>
  );
}

function AddModifier({ onAdd }: { onAdd: (m: Modifier) => void }) {
  const [open, setOpen] = useState(false);
  const kinds: ModifierKind[] = ['mirror', 'array', 'solidify', 'subsurf'];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[11px] flex items-center gap-1 justify-center"
      >
        <Plus size={11} /> Add modifier
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 glass-strong rounded-md py-1 z-20 shadow-window">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => {
                if (k === 'mirror') onAdd({ kind: 'mirror', axis: 'x' });
                else if (k === 'array') onAdd({ kind: 'array', count: 3, offset: [1, 0, 0] });
                else if (k === 'solidify') onAdd({ kind: 'solidify', thickness: 0.05 });
                else onAdd({ kind: 'subsurf', iterations: 1 });
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1 text-[11px] hover:bg-white/10"
            >
              {k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded-md flex items-center justify-center ${
        active ? 'bg-accent text-white' : 'text-white/75 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

// suppress unused warnings for lucide imports
void Eye;
void EyeOff;

function SketchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10 text-white/80"
      >
        <PenLine size={12} /> Sketch
      </button>
      {open && <SketchModal onClose={() => setOpen(false)} />}
    </>
  );
}

function SketchModal({ onClose }: { onClose: () => void }) {
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [depth, setDepth] = useState(0.4);
  const [bevel, setBevel] = useState(0);
  const [name, setName] = useState('Sketch');
  const W = 360;
  const H = 280;
  const PAD = 16;

  const onCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // Snap to 8 px grid
    const sx = Math.round(x / 8) * 8;
    const sy = Math.round(y / 8) * 8;
    setPoints((p) => [...p, { x: sx, y: sy }]);
  };

  const undo = () => setPoints((p) => p.slice(0, -1));
  const clear = () => setPoints([]);

  const extrude = () => {
    if (points.length < 3) return;
    // Convert from screen coords (px) to model units (centered at origin, y inverted)
    const modelPts = points.map((p) => ({
      x: (p.x - W / 2) / 60,
      y: -(p.y - H / 2) / 60,
    }));
    const geom = extrudePolygon(modelPts, depth, bevel);
    useModelerStore.getState().addCustomObject(name || 'Sketch', geom);
    onClose();
  };

  const pathD = points.length
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') +
      (points.length >= 3 ? ` L ${points[0].x} ${points[0].y}` : '')
    : '';

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55">
      <div className="rounded-2xl glass-strong w-[460px] max-w-[92%] p-4 text-white">
        <div className="flex items-center mb-2">
          <div className="font-semibold text-sm">2D Sketch → Extrude</div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/10">
            <XIcon size={13} />
          </button>
        </div>
        <div className="text-[11px] text-white/55 mb-2">
          Click to add corner points. Add at least 3, then Extrude. Use Undo to remove the last point.
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          onClick={onCanvasClick}
          className="bg-black/40 rounded-lg cursor-crosshair block mx-auto"
        >
          <defs>
            <pattern id="sk-grid" width={8} height={8} patternUnits="userSpaceOnUse">
              <circle cx={0.5} cy={0.5} r={0.6} fill="rgba(255,255,255,0.18)" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#sk-grid)" />
          <line x1={W / 2} y1={PAD} x2={W / 2} y2={H - PAD} stroke="rgba(255,255,255,0.1)" />
          <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="rgba(255,255,255,0.1)" />
          {pathD && <path d={pathD} fill="rgba(10,132,255,0.18)" stroke="#0A84FF" strokeWidth={1.5} />}
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#0A84FF" />
          ))}
        </svg>
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="w-12 text-white/55">depth</span>
            <input
              type="range"
              min={0.05}
              max={2}
              step={0.05}
              value={depth}
              onChange={(e) => setDepth(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="font-mono w-8 text-right">{depth.toFixed(2)}</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-12 text-white/55">bevel</span>
            <input
              type="range"
              min={0}
              max={0.2}
              step={0.01}
              value={bevel}
              onChange={(e) => setBevel(parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="font-mono w-8 text-right">{bevel.toFixed(2)}</span>
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs outline-none"
            placeholder="Object name"
          />
          <button
            onClick={undo}
            disabled={points.length === 0}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40 flex items-center gap-1"
          >
            <Undo2 size={11} /> Undo
          </button>
          <button
            onClick={clear}
            disabled={points.length === 0}
            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40"
          >
            Clear
          </button>
          <button
            onClick={extrude}
            disabled={points.length < 3}
            className="px-3 py-1 rounded-md text-xs bg-accent hover:bg-accent-hover text-white disabled:opacity-40"
          >
            Extrude
          </button>
        </div>
        <div className="mt-2 text-[10px] text-white/40 text-right font-mono">
          {points.length} pt{points.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}

const PRESET_BUILDS: Record<string, () => THREE.BufferGeometry> = {
  table: () => {
    const top = new THREE.BoxGeometry(1.4, 0.06, 0.8);
    return top; // simplified: top only for the default; real ones use boolean ops
  },
  // The presets below are intentionally simple - single primitive scenes that
  // give the user a one-click starter. They're light on geometry so they load fast.
  vase: () => new THREE.LatheGeometry(
    Array.from({ length: 12 }, (_, i) => new THREE.Vector2(
      0.25 + 0.15 * Math.sin((i / 11) * Math.PI),
      i * 0.12,
    )),
    32,
  ),
  donut: () => new THREE.TorusGeometry(0.5, 0.18, 16, 32),
  arrow: () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.4);
    shape.lineTo(0.2, 0.0);
    shape.lineTo(0.08, 0.0);
    shape.lineTo(0.08, -0.4);
    shape.lineTo(-0.08, -0.4);
    shape.lineTo(-0.08, 0.0);
    shape.lineTo(-0.2, 0.0);
    shape.lineTo(0, 0.4);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  },
  star: () => {
    const shape = new THREE.Shape();
    const N = 5;
    for (let i = 0; i < N * 2; i++) {
      const a = (i / (N * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.5 : 0.22;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
  },
};

function PresetMenu3D() {
  const [open, setOpen] = useState(false);
  const items: { id: keyof typeof PRESET_BUILDS; label: string }[] = [
    { id: 'donut', label: 'Donut' },
    { id: 'vase', label: 'Vase (Lathe)' },
    { id: 'arrow', label: 'Arrow' },
    { id: 'star', label: 'Star' },
    { id: 'table', label: 'Slab' },
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 h-6 rounded-md text-xs hover:bg-white/10 text-white/80"
      >
        Templates <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 glass-strong rounded-md py-1 min-w-[160px] z-30 shadow-window">
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                const g = PRESET_BUILDS[it.id]();
                useModelerStore.getState().addCustomObject(it.label, g);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-white/10"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const module: AppModule = {
  manifest: {
    id: 'modeler3d',
    name: 'Modeler3D',
    description: 'Custom 3D modeling tool with primitives, booleans, and modifiers',
    icon: ModelerIcon,
    defaultSize: { width: 1080, height: 660 },
    accent: 'linear-gradient(135deg, #f472b6 0%, #8b5cf6 100%)',
  },
  Component: Modeler3D,
};

export default module;
