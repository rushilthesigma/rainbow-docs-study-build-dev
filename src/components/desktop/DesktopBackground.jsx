import { useState, useEffect } from 'react';
import { useUIPreference } from '../../context/UIPreferenceContext';

function isDark() {
  return document.documentElement.classList.contains('dark');
}

export const WALLPAPERS = {
  nebula: {
    label: 'Nebula',
    type: 'css',
    dark: {
      background: `
        radial-gradient(ellipse at 20% 50%, rgba(88, 28, 135, 0.4) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(30, 58, 138, 0.5) 0%, transparent 50%),
        radial-gradient(ellipse at 60% 80%, rgba(15, 23, 42, 0.8) 0%, transparent 50%),
        radial-gradient(ellipse at 40% 30%, rgba(124, 58, 237, 0.2) 0%, transparent 40%),
        radial-gradient(ellipse at 75% 60%, rgba(6, 182, 212, 0.15) 0%, transparent 35%),
        linear-gradient(135deg, #0a0a1a 0%, #0d1117 25%, #0c0e1a 50%, #0f0a1e 75%, #080810 100%)
      `,
    },
    light: {
      background: `
        radial-gradient(ellipse at 20% 50%, rgba(167, 139, 250, 0.25) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(96, 165, 250, 0.3) 0%, transparent 50%),
        linear-gradient(135deg, #e0e7ff 0%, #ede9fe 25%, #e0e7ff 50%, #ddd6fe 75%, #e0e7ff 100%)
      `,
    },
  },
  deepspace: {
    label: 'Deep Space',
    type: 'css',
    dark: {
      background: `
        radial-gradient(ellipse at 15% 40%, rgba(17, 24, 39, 0.9) 0%, transparent 60%),
        radial-gradient(ellipse at 85% 30%, rgba(30, 27, 75, 0.5) 0%, transparent 40%),
        radial-gradient(ellipse at 50% 90%, rgba(88, 28, 135, 0.15) 0%, transparent 50%),
        linear-gradient(180deg, #030712 0%, #0a0a1a 40%, #0c0a15 70%, #050510 100%)
      `,
    },
    light: {
      background: `
        radial-gradient(ellipse at 15% 40%, rgba(219, 234, 254, 0.8) 0%, transparent 60%),
        linear-gradient(180deg, #f0f4ff 0%, #e8ecf4 40%, #eee8f5 70%, #f0f4ff 100%)
      `,
    },
  },
  // Real 4K space wallpapers from Unsplash (free license)
  carina: {
    label: 'Carina Nebula',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=3840&q=80',
    lightUrl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=3840&q=80',
  },
  pillars: {
    label: 'Pillars of Creation',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=3840&q=80',
    lightUrl: 'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=3840&q=80',
  },
  galaxy: {
    label: 'Galaxy',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=3840&q=80',
    lightUrl: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=3840&q=80',
  },
  orion: {
    label: 'Orion Nebula',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=3840&q=80',
    lightUrl: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=3840&q=80',
  },
  milkyway: {
    label: 'Milky Way',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=3840&q=80',
    lightUrl: 'https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=3840&q=80',
  },
  cosmos: {
    label: 'Cosmos',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=3840&q=80',
    lightUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=3840&q=80',
  },
};

export default function DesktopBackground() {
  const { wallpaper } = useUIPreference();
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const wp = WALLPAPERS[wallpaper] || WALLPAPERS.nebula;

  if (wp.type === 'image') {
    const url = dark ? wp.url : (wp.lightUrl || wp.url);
    return (
      <div className="fixed inset-0 z-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500"
          style={{ backgroundImage: `url(${url})` }}
        />
        {/* Slight overlay so window chrome is readable */}
        <div className={`absolute inset-0 ${dark ? 'bg-black/20' : 'bg-white/10'}`} />
      </div>
    );
  }

  // CSS gradient wallpaper
  const style = dark ? wp.dark : wp.light;

  return (
    <div className="fixed inset-0 z-0 transition-all duration-500" style={style}>
      {dark && (
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: `
            radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 50% 10%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 70% 45%, rgba(255,255,255,0.3) 0%, transparent 100%),
            radial-gradient(1px 1px at 90% 70%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 15% 35%, rgba(255,255,255,0.5) 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 65% 75%, rgba(255,255,255,0.4) 0%, transparent 100%),
            radial-gradient(1px 1px at 45% 95%, rgba(255,255,255,0.2) 0%, transparent 100%)
          `,
        }} />
      )}
    </div>
  );
}
