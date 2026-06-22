import { useState, useEffect, memo } from 'react';
import { useUIPreference } from '../../context/UIPreferenceContext';

function isDark() {
  return document.documentElement.classList.contains('dark');
}

export const WALLPAPERS = {
  // ===== Default (matches landing page) =====
  milkyway:   { label: 'Milky Way',        type: 'image', url: 'https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?w=3840&q=80' },

  // ===== Landscapes =====
  lavender:  { label: 'Lavender Fields',   type: 'image', url: 'https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=3840&q=80' },
  forest:    { label: 'Redwood Forest',    type: 'image', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=3840&q=80' },
  aurora:    { label: 'Northern Lights',   type: 'image', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=3840&q=80' },
  mountain:  { label: 'Mountain Peak',     type: 'image', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=3840&q=80' },
  lake:      { label: 'Mountain Lake',     type: 'image', url: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=3840&q=80' },
  ocean:     { label: 'Ocean Waves',       type: 'image', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=3840&q=80' },
  sunset:    { label: 'Sunset Valley',     type: 'image', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=3840&q=80' },
  cliff:     { label: 'Sea Cliff',         type: 'image', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=3840&q=80' },
  meadow:    { label: 'Alpine Meadow',     type: 'image', url: 'https://images.unsplash.com/photo-1470115636492-6d2b56f9146d?w=3840&q=80' },
  iceland:   { label: 'Iceland Glacier',   type: 'image', url: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=3840&q=80' },
  tropical:  { label: 'Tropical Beach',    type: 'image', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=3840&q=80' },
  waterfall: { label: 'Waterfall',         type: 'image', url: 'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=3840&q=80' },
  canyon:    { label: 'Canyon',            type: 'image', url: 'https://images.unsplash.com/photo-1533423996375-f442b9a48aec?w=3840&q=80' },

  // ===== Space =====
  galaxy:     { label: 'Galaxy',           type: 'image', url: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=3840&q=80' },
  cosmos:     { label: 'Cosmos',           type: 'image', url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=3840&q=80' },
  earthnight: { label: 'Earth at Night',   type: 'image', url: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=3840&q=80' },
  nebula:     { label: 'Nebula',           type: 'image', url: 'https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=3840&q=80' },
  moon:       { label: 'Moon',             type: 'image', url: 'https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=3840&q=80' },
};

export const WALLPAPER_LIST = Object.entries(WALLPAPERS).map(([id, w]) => ({ id, label: w.label }));

// Memoized so MacOSContent re-renders (on every focusWindow / moveWindow /
// etc.) don't cascade into DesktopBackground. The background only needs to
// update when the wallpaper preference or dark mode changes.
export default memo(function DesktopBackground() {
  const { wallpaper } = useUIPreference();
  const [dark, setDark] = useState(isDark);
  // Image wallpapers load over the network; fading in once decoded avoids
  // the hard pop from blank to full image on boot and on wallpaper change.
  const [loadedUrl, setLoadedUrl] = useState(null);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Match the signed-out landing page's nighttime-sky wallpaper by default.
  const effectiveWallpaper = WALLPAPERS[wallpaper] ? wallpaper : 'milkyway';
  const wp = WALLPAPERS[effectiveWallpaper] || WALLPAPERS.milkyway;

  useEffect(() => {
    if (wp.type !== 'image') return;
    let stale = false;
    const img = new Image();
    img.onload = () => { if (!stale) setLoadedUrl(wp.url); };
    img.onerror = () => { if (!stale) setLoadedUrl(wp.url); };
    img.src = wp.url;
    return () => { stale = true; };
  }, [wp.type, wp.url]);

  if (wp.type === 'image') {
    return (
      <div className="fixed inset-0 z-0 bg-[#10131c]">
        <div
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500 ${loadedUrl === wp.url ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundImage: `url(${wp.url})` }}
        />
        <div className={`absolute inset-0 ${dark ? 'bg-black/20' : 'bg-white/5'}`} />
      </div>
    );
  }

  const style = dark ? wp.dark : wp.light;
  return <div className="fixed inset-0 z-0" style={style} />;
});
