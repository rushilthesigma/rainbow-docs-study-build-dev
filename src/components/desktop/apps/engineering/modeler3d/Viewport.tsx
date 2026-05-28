import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  TransformControls,
  Grid,
  GizmoHelper,
  GizmoViewport,
} from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useModelerStore, type SceneObject } from '@/store/modelerStore';
import { applyStack } from '@/lib/modeler/modifiers';

export default function ModelerViewport() {
  return (
    <Canvas
      camera={{ position: [4, 3.5, 5], fov: 50, near: 0.05, far: 200 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      shadows
    >
      <color attach="background" args={['#0b1020']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 10, 5]} intensity={1.4} castShadow />
      <directionalLight position={[-4, 6, -6]} intensity={0.6} />
      <directionalLight position={[0, -4, 4]} intensity={0.25} />

      <SceneObjects />

      <Grid
        args={[20, 20]}
        cellColor="#1f2937"
        sectionColor="#334155"
        sectionThickness={1}
        cellThickness={0.6}
        fadeDistance={36}
        infiniteGrid
      />
      <OrbitControls makeDefault enableDamping />
      <GizmoHelper alignment="top-right" margin={[60, 50]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#0ea5e9']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}

function SceneObjects() {
  const objects = useModelerStore((s) => s.objects);
  const selectedId = useModelerStore((s) => s.selectedId);
  const transformMode = useModelerStore((s) => s.transformMode);
  const select = useModelerStore((s) => s.select);
  const setTransform = useModelerStore((s) => s.setTransform);
  const { camera, gl } = useThree();
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  // refTick bumps every time a child registers/deregisters a mesh ref so we
  // can re-render and pick up the latest mesh in the TransformControls JSX.
  const [refTick, setRefTick] = useState(0);
  const bump = () => setRefTick((t) => t + 1);
  void refTick;

  const selectedMesh = selectedId ? meshRefs.current.get(selectedId) : null;

  return (
    <>
      {objects.map((o) => (
        <Obj
          key={o.id}
          obj={o}
          onClick={() => select(o.id)}
          meshRefs={meshRefs}
          onRefChange={bump}
        />
      ))}
      {selectedId && selectedMesh && (
        <TransformControls
          // eslint-disable-next-line react/no-unknown-property
          object={selectedMesh}
          mode={transformMode}
          camera={camera}
          domElement={gl.domElement}
          onObjectChange={() => {
            const mesh = meshRefs.current.get(selectedId);
            if (!mesh) return;
            setTransform(selectedId, {
              position: [mesh.position.x, mesh.position.y, mesh.position.z],
              rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
              scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
            });
          }}
        />
      )}
    </>
  );
}

function Obj({
  obj,
  onClick,
  meshRefs,
  onRefChange,
}: {
  obj: SceneObject;
  onClick: () => void;
  meshRefs: React.MutableRefObject<Map<string, THREE.Mesh>>;
  onRefChange: () => void;
}) {
  const selectedId = useModelerStore((s) => s.selectedId);
  const isSelected = selectedId === obj.id;

  // Apply modifier stack only when geometry or modifiers change
  const geom = useMemo(() => {
    if (!obj.modifiers.length) return obj.geometry;
    return applyStack(obj.geometry, obj.modifiers);
  }, [obj.geometry, obj.modifiers]);

  // Dispose previously generated geometries when this one changes
  useEffect(() => {
    return () => {
      if (geom !== obj.geometry) geom.dispose();
    };
  }, [geom, obj.geometry]);

  return (
    <mesh
      ref={(m) => {
        if (m) {
          meshRefs.current.set(obj.id, m);
          onRefChange();
        } else if (meshRefs.current.has(obj.id)) {
          meshRefs.current.delete(obj.id);
          onRefChange();
        }
      }}
      geometry={geom}
      position={obj.position}
      rotation={obj.rotation}
      scale={obj.scale}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <meshStandardMaterial
        color={obj.color}
        metalness={obj.metalness}
        roughness={obj.roughness}
        emissive={obj.emissive}
        emissiveIntensity={obj.emissive === '#000000' ? 0 : 0.5}
        wireframe={obj.wireframe}
      />
      {isSelected && (
        // eslint-disable-next-line react/no-unknown-property
        <meshBasicMaterial attach="material" wireframe color="#0A84FF" transparent opacity={0.0} />
      )}
    </mesh>
  );
}
