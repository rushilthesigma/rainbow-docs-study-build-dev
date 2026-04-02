import { useRef, useState, useCallback, useEffect } from 'react';
import APP_REGISTRY from './appRegistry';
import { useWindowManager } from '../../context/WindowManagerContext';
import { useUIPreference } from '../../context/UIPreferenceContext';
import { checkAdmin } from '../../api/admin';

const DOCK_SIZES = { small: 36, medium: 48, large: 60 };
const ICON_SIZES = { small: 20, medium: 26, large: 32 };

function DockIcon({ app, mouseX, iconRef, isOpen, onClick, size, iconStyle }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const Icon = app.icon;

  let scale = 1;
  if (mouseX !== null && iconRef?.current) {
    const rect = iconRef.current.getBoundingClientRect();
    const iconCenter = rect.left + rect.width / 2;
    const distance = Math.abs(mouseX - iconCenter);
    const maxDist = 120;
    if (distance < maxDist) {
      scale = 1 + 0.5 * (1 + Math.cos(Math.PI * distance / maxDist)) / 2;
    }
  }

  return (
    <div className="relative flex flex-col items-center" ref={iconRef}>
      {tooltipVisible && (
        <div className="absolute -top-9 px-2.5 py-1 rounded-md bg-gray-800/90 text-white text-[11px] font-medium whitespace-nowrap backdrop-blur-sm pointer-events-none z-10">
          {app.label}
        </div>
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setTooltipVisible(true)}
        onMouseLeave={() => setTooltipVisible(false)}
        className="dock-icon flex items-center justify-center rounded-[13px] shadow-lg transition-transform duration-150 ease-out"
        style={{
          width: size, height: size,
          transform: `scale(${scale})`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className={`w-full h-full rounded-[13px] flex items-center justify-center ${
            iconStyle === 'mono' ? 'bg-[#2a2a2e]' :
            iconStyle === 'glass' ? 'border border-white/20' :
            iconStyle === 'accent' ? '' :
            `bg-gradient-to-br ${app.gradient}`
          }`}
          style={
            iconStyle === 'glass' ? { background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' } :
            iconStyle === 'accent' ? { backgroundColor: `${app.color}22`, border: `1px solid ${app.color}44` } :
            undefined
          }
        >
          <Icon
            size={ICON_SIZES[Object.keys(DOCK_SIZES).find(k => DOCK_SIZES[k] === size) || 'medium']}
            className={iconStyle === 'accent' ? 'drop-shadow-sm' : 'text-white drop-shadow-sm'}
            style={iconStyle === 'accent' ? { color: app.color } : undefined}
          />
        </div>
      </button>
      {isOpen && <div className="w-1 h-1 rounded-full bg-white/80 mt-0.5" />}
      {!isOpen && <div className="w-1 h-1 mt-0.5" />}
    </div>
  );
}

export default function Dock() {
  const { state, openApp } = useWindowManager();
  const { dockSize, iconStyle } = useUIPreference();
  const [mouseX, setMouseX] = useState(null);
  const dockRef = useRef(null);
  const iconRefs = useRef({});
  const size = DOCK_SIZES[dockSize] || 48;

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { checkAdmin().then(d => setIsAdmin(d.isAdmin)).catch(() => {}); }, []);

  const handleMouseMove = useCallback((e) => { setMouseX(e.clientX); }, []);

  const mainApps = APP_REGISTRY.filter(a => !['settings', 'newcurriculum'].includes(a.id) && (!a.adminOnly || isAdmin));
  const utilApps = APP_REGISTRY.filter(a => ['settings'].includes(a.id));
  const openAppIds = new Set(Object.values(state.windows).map(w => w.appId));

  function getIconRef(id) {
    if (!iconRefs.current[id]) iconRefs.current[id] = { current: null };
    return iconRefs.current[id];
  }

  return (
    <div>
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[1002]">
        <div
          ref={dockRef}
          className="flex items-end gap-1.5 px-3 py-2 rounded-2xl border border-white/15 dark:border-white/10 shadow-2xl"
          style={{ background: 'rgba(30, 30, 40, 0.55)', backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMouseX(null)}
        >
          {mainApps.map(app => (
            <DockIcon key={app.id} app={app} mouseX={mouseX} iconRef={getIconRef(app.id)} isOpen={openAppIds.has(app.id)} onClick={() => openApp(app.id, app.label)} size={size} iconStyle={iconStyle} />
          ))}
          <div className="w-px bg-white/15 mx-1 self-center" style={{ height: size * 0.7 }} />
          {utilApps.map(app => (
            <DockIcon key={app.id} app={app} mouseX={mouseX} iconRef={getIconRef(app.id)} isOpen={openAppIds.has(app.id)} onClick={() => openApp(app.id, app.label)} size={size} iconStyle={iconStyle} />
          ))}
        </div>
      </div>
    </div>
  );
}
