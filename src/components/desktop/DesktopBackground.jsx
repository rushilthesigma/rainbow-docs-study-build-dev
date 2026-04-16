import { useState, useEffect } from 'react';
import { useUIPreference } from '../../context/UIPreferenceContext';

function isDark() {
  return document.documentElement.classList.contains('dark');
}

export const WALLPAPERS = {
  // Iconic real wallpapers
  bliss: { label: 'Bliss (Windows XP)', type: 'image', url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=3840&q=80' },
  monterey: { label: 'Monterey (macOS)', type: 'image', url: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=3840&q=80' },
  aurora: { label: 'Northern Lights', type: 'image', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=3840&q=80' },
  mountain: { label: 'Mountain Peak', type: 'image', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=3840&q=80' },
  desert: { label: 'Desert Dunes', type: 'image', url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=3840&q=80' },
  lake: { label: 'Mountain Lake', type: 'image', url: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=3840&q=80' },
  lavender: { label: 'Lavender Fields', type: 'image', url: 'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=3840&q=80' },
  forest: { label: 'Redwood Forest', type: 'image', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=3840&q=80' },
  ocean: { label: 'Ocean Waves', type: 'image', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=3840&q=80' },
  sunset: { label: 'Sunset Valley', type: 'image', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=3840&q=80' },
  cherry: { label: 'Cherry Blossoms', type: 'image', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=3840&q=80' },
  cliff: { label: 'Sea Cliff', type: 'image', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=3840&q=80' },
  // Space
  galaxy: { label: 'Galaxy', type: 'image', url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=3840&q=80' },
  milkyway: { label: 'Milky Way', type: 'image', url: 'https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=3840&q=80' },
  cosmos: { label: 'Cosmos', type: 'image', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=3840&q=80' },
  earthnight: { label: 'Earth at Night', type: 'image', url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=3840&q=80' },
  // Abstract / Solid
  darksolid: { label: 'Dark', type: 'css',
    dark: { background: '#0D0D14' },
    light: { background: '#f1f5f9' },
  },
  midnight: { label: 'Midnight Blue', type: 'css',
    dark: { background: 'linear-gradient(180deg, #020617 0%, #0a0a14 50%, #030712 100%)' },
    light: { background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)' },
  },
};

export const WALLPAPER_LIST = Object.entries(WALLPAPERS).map(([id, w]) => ({ id, label: w.label }));

export default function DesktopBackground() {
  const { wallpaper } = useUIPreference();
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Default wallpaper per OS style
  const osStyle = localStorage.getItem('cov-desktop-style') || 'macos';
  const OS_DEFAULTS = { macos: 'monterey', windows: 'bliss', chromeos: 'mountain', linux: 'midnight' };
  const effectiveWallpaper = WALLPAPERS[wallpaper] ? wallpaper : (OS_DEFAULTS[osStyle] || 'bliss');
  const wp = WALLPAPERS[effectiveWallpaper] || WALLPAPERS.bliss;

  if (wp.type === 'image') {
    return (
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${wp.url})` }} />
        <div className={`absolute inset-0 ${dark ? 'bg-black/20' : 'bg-white/5'}`} />
      </div>
    );
  }

  const style = dark ? wp.dark : wp.light;
  return <div className="fixed inset-0 z-0" style={style} />;
}
