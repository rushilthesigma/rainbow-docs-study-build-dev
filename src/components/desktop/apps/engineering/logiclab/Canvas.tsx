import { useEffect, useRef, useState } from 'react';
import {
  useLogicLabStore,
  getPinAbsolutePosition,
  pinId,
} from '@/store/logicLabStore';
import { SPECS } from '@/lib/logicsim/gates';
import type { Bit, Component, GateType } from '@/lib/logicsim/types';
import { routeWire } from '@/lib/logicsim/routing';

const GRID = 20;
const CANVAS_BG = '#0b1020';

export default function Canvas() {
  const components = useLogicLabStore((s) => s.components);
  const connections = useLogicLabStore((s) => s.connections);
  const selectedId = useLogicLabStore((s) => s.selectedId);
  const setSelected = useLogicLabStore((s) => s.setSelected);
  const moveComponent = useLogicLabStore((s) => s.moveComponent);
  const addComponent = useLogicLabStore((s) => s.addComponent);
  const removeComponent = useLogicLabStore((s) => s.removeComponent);
  const beginWire = useLogicLabStore((s) => s.beginWire);
  const cancelWire = useLogicLabStore((s) => s.cancelWire);
  const completeWire = useLogicLabStore((s) => s.completeWire);
  const setWireCursor = useLogicLabStore((s) => s.setWireCursor);
  const removeConnection = useLogicLabStore((s) => s.removeConnection);
  const wiringFrom = useLogicLabStore((s) => s.wiringFrom);
  const wireCursor = useLogicLabStore((s) => s.wireCursor);
  const pinValues = useLogicLabStore((s) => s.pinValues);
  const oscillatingConnections = useLogicLabStore((s) => s.oscillatingConnections);
  const oscillating = useLogicLabStore((s) => s.oscillating);
  const toggleInput = useLogicLabStore((s) => s.toggleInput);
  const viewport = useLogicLabStore((s) => s.viewport);
  const setViewport = useLogicLabStore((s) => s.setViewport);

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Track container size for viewBox math
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Convert screen → canvas coords
  const screenToCanvas = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const sx = (clientX - r.left) / r.width;
    const sy = (clientY - r.top) / r.height;
    return {
      x: viewport.x + sx * (size.w / viewport.zoom),
      y: viewport.y + sy * (size.h / viewport.zoom),
    };
  };

  // Mouse move while wiring
  useEffect(() => {
    if (!wiringFrom) return;
    const onMove = (e: MouseEvent) => {
      const p = screenToCanvas(e.clientX, e.clientY);
      setWireCursor(p);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiringFrom, viewport, size]);

  // Esc cancels wire
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && wiringFrom) cancelWire();
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement?.tagName !== 'INPUT') {
          removeComponent(selectedId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wiringFrom, cancelWire, selectedId, removeComponent]);

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    const oldZoom = viewport.zoom;
    const newZoom = Math.max(0.3, Math.min(3, oldZoom * zoomFactor));
    const r = svgRef.current!.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    // Keep cursor anchored
    const worldX = viewport.x + (cx / r.width) * (size.w / oldZoom);
    const worldY = viewport.y + (cy / r.height) * (size.h / oldZoom);
    const newX = worldX - (cx / r.width) * (size.w / newZoom);
    const newY = worldY - (cy / r.height) * (size.h / newZoom);
    setViewport({ x: newX, y: newY, zoom: newZoom });
  };

  // Background pan with middle mouse OR right mouse OR space-drag
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      e.preventDefault();
      panRef.current = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
      const onMove = (ev: MouseEvent) => {
        if (!panRef.current) return;
        const dx = (ev.clientX - panRef.current.x) / viewport.zoom;
        const dy = (ev.clientY - panRef.current.y) / viewport.zoom;
        setViewport({ x: panRef.current.vx - dx, y: panRef.current.vy - dy });
      };
      const onUp = () => {
        panRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    } else if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).hasAttribute('data-bg')) {
      // Clicking empty canvas → deselect or cancel wire
      if (wiringFrom) cancelWire();
      setSelected(null);
    }
  };

  // Drop placement (from palette HTML5 drag)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/x-engos-gate') as GateType;
    if (!type) return;
    const p = screenToCanvas(e.clientX, e.clientY);
    addComponent(type, p.x, p.y);
  };

  // Visible viewBox
  const vbW = size.w / viewport.zoom;
  const vbH = size.h / viewport.zoom;

  return (
    <svg
      ref={svgRef}
      className="w-full h-full block"
      style={{ background: CANVAS_BG, cursor: panRef.current ? 'grabbing' : 'default' }}
      viewBox={`${viewport.x} ${viewport.y} ${vbW} ${vbH}`}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Grid pattern */}
      <defs>
        <pattern id="ll-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.7} fill="rgba(255,255,255,0.18)" />
        </pattern>
      </defs>
      <rect
        data-bg="true"
        x={viewport.x - vbW}
        y={viewport.y - vbH}
        width={vbW * 3}
        height={vbH * 3}
        fill="url(#ll-grid)"
      />

      {/* Connections */}
      {connections.map((c) => {
        const [fromComp, fromPin] = c.from.split(':');
        const [toComp, toPin] = c.to.split(':');
        const f = components.find((x) => x.id === fromComp);
        const t = components.find((x) => x.id === toComp);
        if (!f || !t) return null;
        const a = getPinAbsolutePosition(f, fromPin);
        const b = getPinAbsolutePosition(t, toPin);
        const v = pinValues.get(c.from) ?? 'z';
        const osc = oscillatingConnections.has(c.id);
        const stroke = osc
          ? '#ef4444'
          : v === 1
            ? '#22c55e'
            : v === 0
              ? '#6b7280'
              : '#94a3b8';
        return (
          <path
            key={c.id}
            d={routeWire(a, b)}
            stroke={stroke}
            strokeWidth={1.6}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey) removeConnection(c.id);
            }}
            style={{ cursor: 'pointer' }}
          >
            <title>shift-click to delete</title>
          </path>
        );
      })}

      {/* In-progress wire */}
      {wiringFrom && wireCursor && (() => {
        const [cid, pn] = wiringFrom.split(':');
        const fc = components.find((c) => c.id === cid);
        if (!fc) return null;
        const a = getPinAbsolutePosition(fc, pn);
        return (
          <path
            d={routeWire(a, wireCursor)}
            stroke="#0A84FF"
            strokeWidth={1.6}
            strokeDasharray="4 3"
            fill="none"
            pointerEvents="none"
          />
        );
      })()}

      {/* Components */}
      {components.map((c) => (
        <Gate
          key={c.id}
          comp={c}
          selected={c.id === selectedId}
          oscillating={oscillating.has(c.id)}
          onSelect={() => setSelected(c.id)}
          onMove={(x, y) => moveComponent(c.id, x, y)}
          onToggle={() => toggleInput(c.id)}
          onPinDown={(name, kind) => {
            const id = pinId(c.id, name);
            if (kind === 'out') {
              beginWire(id);
            } else if (kind === 'in' && wiringFrom) {
              completeWire(id);
            }
          }}
          screenToCanvas={screenToCanvas}
          pinValues={pinValues}
        />
      ))}
    </svg>
  );
}

interface GateProps {
  comp: Component;
  selected: boolean;
  oscillating: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onToggle: () => void;
  onPinDown: (name: string, kind: 'in' | 'out') => void;
  screenToCanvas: (cx: number, cy: number) => { x: number; y: number };
  pinValues: Map<string, Bit>;
}

function Gate({
  comp,
  selected,
  oscillating,
  onSelect,
  onMove,
  onToggle,
  onPinDown,
  screenToCanvas,
  pinValues,
}: GateProps) {
  const spec = SPECS[comp.type];
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number; moved: boolean } | null>(null);
  const [hoverPin, setHoverPin] = useState<string | null>(null);

  const onBodyDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect();
    const p = screenToCanvas(e.clientX, e.clientY);
    dragRef.current = { ox: p.x, oy: p.y, px: comp.x, py: comp.y, moved: false };
    const onMoveMs = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const np = screenToCanvas(ev.clientX, ev.clientY);
      const nx = dragRef.current.px + (np.x - dragRef.current.ox);
      const ny = dragRef.current.py + (np.y - dragRef.current.oy);
      if (
        !dragRef.current.moved &&
        (Math.abs(nx - dragRef.current.px) > 1 || Math.abs(ny - dragRef.current.py) > 1)
      ) {
        dragRef.current.moved = true;
      }
      onMove(nx, ny);
    };
    const onUpMs = () => {
      const wasMoved = dragRef.current?.moved;
      dragRef.current = null;
      window.removeEventListener('mousemove', onMoveMs);
      window.removeEventListener('mouseup', onUpMs);
      // Click without drag on an input → toggle
      if (!wasMoved && comp.type === 'input') onToggle();
    };
    window.addEventListener('mousemove', onMoveMs);
    window.addEventListener('mouseup', onUpMs);
  };

  const outValue = pinValues.get(`${comp.id}:out`) ?? 0;
  const bodyFill =
    comp.type === 'output'
      ? comp.state.value === 1
        ? '#22c55e'
        : '#1f2937'
      : comp.type === 'input'
        ? comp.state.value === 1
          ? '#22c55e'
          : '#374151'
        : oscillating
          ? '#7f1d1d'
          : '#1e293b';
  const stroke = selected ? '#0A84FF' : 'rgba(255,255,255,0.25)';

  return (
    <g transform={`translate(${comp.x}, ${comp.y})`}>
      {/* Body */}
      {comp.type === 'output' ? (
        <circle
          cx={spec.width / 2}
          cy={spec.height / 2}
          r={spec.width / 2 - 2}
          fill={bodyFill}
          stroke={stroke}
          strokeWidth={selected ? 2 : 1}
          onMouseDown={onBodyDown}
          style={{ cursor: 'move' }}
        />
      ) : comp.type === 'seg7' ? (
        <Seg7Body spec={spec} segments={(comp.state.segments as number) ?? 0} stroke={stroke} onMouseDown={onBodyDown} />
      ) : (
        <rect
          width={spec.width}
          height={spec.height}
          rx={8}
          fill={bodyFill}
          stroke={stroke}
          strokeWidth={selected ? 2 : 1}
          onMouseDown={onBodyDown}
          style={{ cursor: 'move' }}
        />
      )}

      {/* Label / symbol */}
      {comp.type !== 'output' && comp.type !== 'seg7' && (
        <text
          x={spec.width / 2}
          y={spec.height / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fill="white"
          fontFamily="JetBrains Mono, monospace"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          {spec.label}
        </text>
      )}
      {comp.type === 'input' && (
        <text
          x={spec.width / 2}
          y={spec.height / 2 + 4}
          textAnchor="middle"
          fontSize={14}
          fontWeight={600}
          fill="white"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          {comp.state.value === 1 ? '1' : '0'}
        </text>
      )}
      {comp.type === 'clock' && (
        <text
          x={spec.width / 2}
          y={spec.height + 12}
          textAnchor="middle"
          fontSize={9}
          fill="rgba(255,255,255,0.6)"
          fontFamily="JetBrains Mono, monospace"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >
          {(comp.state.hz as number)?.toFixed(1)}Hz
        </text>
      )}

      {/* Pins */}
      {spec.pins.map((p) => {
        const id = `${comp.id}:${p.name}`;
        const v = pinValues.get(id);
        const isHover = hoverPin === p.name;
        let pinFill = '#475569';
        if (p.kind === 'out' && outValue === 1) pinFill = '#22c55e';
        if (v === 1) pinFill = '#22c55e';
        return (
          <g key={p.name}>
            {/* Wire stub */}
            <line
              x1={p.x}
              y1={p.y}
              x2={p.kind === 'in' ? p.x - 6 : p.x + 6}
              y2={p.y}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1.2}
              pointerEvents="none"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={4}
              fill={pinFill}
              stroke={isHover ? '#0A84FF' : '#0f172a'}
              strokeWidth={isHover ? 2 : 1}
              onMouseEnter={() => setHoverPin(p.name)}
              onMouseLeave={() => setHoverPin(null)}
              onMouseDown={(e) => {
                e.stopPropagation();
                onPinDown(p.name, p.kind);
              }}
              style={{ cursor: 'crosshair' }}
            >
              <title>{p.name} ({p.kind})</title>
            </circle>
          </g>
        );
      })}
    </g>
  );
}

function Seg7Body({
  spec,
  segments,
  stroke,
  onMouseDown,
}: {
  spec: { width: number; height: number };
  segments: number;
  stroke: string;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  // segments bit positions: gfedcba (6..0)
  const on = (i: number) => (segments & (1 << i)) !== 0;
  const w = spec.width;
  const h = spec.height;
  // 7-segment geometry inset within (12, 8) to (w-6, h-8)
  const x0 = 14;
  const x1 = w - 8;
  const y0 = 8;
  const y1 = h / 2;
  const y2 = h - 8;
  const onColor = '#ef4444';
  const off = 'rgba(255,255,255,0.08)';
  const t = 3;
  return (
    <g>
      <rect width={w} height={h} rx={6} fill="#0f172a" stroke={stroke} onMouseDown={onMouseDown} style={{ cursor: 'move' }} />
      {/* a: top */}
      <line x1={x0 + 2} y1={y0} x2={x1 - 2} y2={y0} stroke={on(0) ? onColor : off} strokeWidth={t} strokeLinecap="round" pointerEvents="none" />
      {/* b: top-right */}
      <line x1={x1} y1={y0 + 2} x2={x1} y2={y1 - 2} stroke={on(1) ? onColor : off} strokeWidth={t} strokeLinecap="round" pointerEvents="none" />
      {/* c: bottom-right */}
      <line x1={x1} y1={y1 + 2} x2={x1} y2={y2 - 2} stroke={on(2) ? onColor : off} strokeWidth={t} strokeLinecap="round" pointerEvents="none" />
      {/* d: bottom */}
      <line x1={x0 + 2} y1={y2} x2={x1 - 2} y2={y2} stroke={on(3) ? onColor : off} strokeWidth={t} strokeLinecap="round" pointerEvents="none" />
      {/* e: bottom-left */}
      <line x1={x0} y1={y1 + 2} x2={x0} y2={y2 - 2} stroke={on(4) ? onColor : off} strokeWidth={t} strokeLinecap="round" pointerEvents="none" />
      {/* f: top-left */}
      <line x1={x0} y1={y0 + 2} x2={x0} y2={y1 - 2} stroke={on(5) ? onColor : off} strokeWidth={t} strokeLinecap="round" pointerEvents="none" />
      {/* g: middle */}
      <line x1={x0 + 2} y1={y1} x2={x1 - 2} y2={y1} stroke={on(6) ? onColor : off} strokeWidth={t} strokeLinecap="round" pointerEvents="none" />
    </g>
  );
}
