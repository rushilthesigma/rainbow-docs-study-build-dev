import { useState, useEffect, useRef } from 'react';
import { BookOpen, Search, LogOut, ChevronDown, KeyRound, X, ArrowLeft } from 'lucide-react';
import { useWindowManager } from '../../context/WindowManagerContext';
import { getApp } from './appRegistry';
import { useAuth } from '../../context/AuthContext';
import { exitChild } from '../../api/parent';
import { Z } from '../../styles/tokens';
import ReferralChip from './ReferralChip';
import UpgradeChip from '../billing/UpgradeChip';

// The clock lives in its own component so the 30s tick re-renders ONLY
// this span - not the entire menu bar. The bar carries a heavy
// backdrop-filter: a full-bar re-render repaints the whole strip and
// forces the compositor to re-sample every window layer beneath it,
// which is one of the periodic triggers of the multi-window wallpaper
// flash. Bonus: setLabel with an identical string makes React bail out
// entirely, so ticks where the displayed minute hasn't changed cost
// nothing at all.
function formatClock(d) {
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

function MenuBarClock({ dark }) {
  const [label, setLabel] = useState(() => formatClock(new Date()));
  useEffect(() => {
    const interval = setInterval(() => setLabel(formatClock(new Date())), 30000);
    return () => clearInterval(interval);
  }, []);
  return <span className={`tabular-nums ${dark ? 'text-white/70' : 'text-gray-600'}`}>{label}</span>;
}

export default function MenuBar({ onSpotlight }) {
  const { state } = useWindowManager();
  const { user, logout, fetchUser, setProfilePicked } = useAuth();
  const dark = true; // theme is always dark
  const [showUserMenu, setShowUserMenu] = useState(false);
  // 'menu' | 'pin' - which view is inside the dropdown
  const [menuView, setMenuView] = useState('menu');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const menuRef = useRef(null);
  const pinInputRef = useRef(null);

  useEffect(() => {
    if (!showUserMenu) return;
    function onClick(e) { if (menuRef.current && !menuRef.current.contains(e.target)) closeMenu(); }
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [showUserMenu]);

  // Focus PIN input when switching to PIN view
  useEffect(() => {
    if (menuView === 'pin') pinInputRef.current?.focus();
  }, [menuView]);

  const activeWin = state.activeWindowId ? state.windows[state.activeWindowId] : null;
  const activeApp = activeWin ? getApp(activeWin.appId) : null;

  const parent = user?.data?.parent;
  const activeChild = parent?.enabled && parent?.activeStudentId
    ? parent.students?.find(s => s.id === parent.activeStudentId)
    : null;

  function openMenu() {
    setShowUserMenu(true);
    setMenuView('menu');
    setPinValue('');
    setPinError('');
  }

  function closeMenu() {
    setShowUserMenu(false);
    setMenuView('menu');
    setPinValue('');
    setPinError('');
  }

  function startPinEntry() {
    setMenuView('pin');
    setPinValue('');
    setPinError('');
  }

  async function submitPin(e) {
    e?.preventDefault?.();
    if (!/^[0-9]{4,6}$/.test(pinValue)) {
      setPinError('PIN must be 4-6 digits.');
      return;
    }
    setPinBusy(true);
    setPinError('');
    try {
      await exitChild(pinValue);
      await fetchUser();
      // Stash verified PIN for ParentPage auto-unlock, then show home screen
      sessionStorage.setItem('cov-parent-pin', pinValue);
      closeMenu();
      setProfilePicked(false);  // show the profile picker (home screen)
    } catch {
      setPinError('Incorrect PIN. Try again.');
      setPinValue('');
    } finally {
      setPinBusy(false);
    }
  }

  const dropdownBg = dark ? 'rgba(30, 30, 40, 0.95)' : 'rgba(255, 255, 255, 0.97)';
  const dropdownBorder = dark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)';

  return (
    <div
      data-menubar
      className="fixed top-0 left-0 right-0 h-7 flex items-center justify-between px-4 select-none text-[13px]"
      style={{
        zIndex: Z.menubar,
        background: dark ? 'rgba(22, 20, 42, 0.48)' : 'rgba(220, 220, 228, 0.50)',
        // blur radius drives backdrop-filter cost: a full-width always-on bar
        // re-samples its backdrop on every repaint behind it, and a 64px radius
        // is the single most expensive composite in the shell - the dominant
        // contributor to the multi-window wallpaper-flash (compositor misses
        // vsync while re-blurring). At 48% background opacity 30px is visually
        // identical to 64px but a fraction of the cost. Matches the Dock's
        // lighter blur so the chrome is consistent.
        backdropFilter: 'blur(30px) saturate(2.2)',
        WebkitBackdropFilter: 'blur(30px) saturate(2.2)',
        borderBottom: dark ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.08)',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <BookOpen size={14} className={dark ? 'text-white/90' : 'text-gray-800'} />
          <span className={`font-semibold ${dark ? 'text-white/90' : 'text-gray-800'}`}>RushilAI</span>
        </div>
        {activeApp && (
          <>
            <span className={dark ? 'text-white/30' : 'text-gray-300'}>|</span>
            <span className={`font-medium ${dark ? 'text-white/70' : 'text-gray-600'}`}>{activeApp.label}</span>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <UpgradeChip />
        <ReferralChip />
        <button
          onClick={onSpotlight}
          className={`p-1 rounded ${dark ? 'text-white/50 hover:text-white/80' : 'text-gray-500 hover:text-gray-800'} transition-colors`}
          title="Spotlight (Cmd+K)"
        >
          <Search size={13} />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => showUserMenu ? closeMenu() : openMenu()}
            className={`flex items-center gap-1 px-1 rounded ${dark ? 'text-white/60 hover:text-white/90' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
          >
            {activeChild && (
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white mr-1"
                style={{ backgroundColor: activeChild.color }}
              >
                {activeChild.avatar || activeChild.name?.charAt(0)?.toUpperCase()}
              </span>
            )}
            <span>{activeChild ? activeChild.name : (user?.name?.split(' ')[0] || 'User')}</span>
            <ChevronDown size={10} />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 top-7 w-56 rounded-lg shadow-xl overflow-hidden"
              style={{ zIndex: Z.menubarMenu, background: dropdownBg, backdropFilter: 'blur(30px)', border: dropdownBorder }}
            >
              {menuView === 'menu' && (
                <>
                  <div className={`px-3 py-2 border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}>
                    <p className={`text-xs font-medium ${dark ? 'text-white' : 'text-gray-900'}`}>
                      {activeChild ? activeChild.name : (user?.name || 'User')}
                    </p>
                    <p className={`text-[10px] ${dark ? 'text-white/50' : 'text-gray-400'}`}>
                      {activeChild ? 'Child profile' : user?.email}
                    </p>
                  </div>

                  {/* Home screen - child needs PIN first */}
                  {activeChild && (
                    <button
                      onClick={startPinEntry}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${dark ? 'text-blue-300 hover:bg-white/5' : 'text-blue-600 hover:bg-gray-50'} transition-colors border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}
                    >
                      <KeyRound size={12} /> Home screen
                    </button>
                  )}

                  {/* Home screen - family manager, no PIN */}
                  {parent?.enabled && !activeChild && (parent.students?.length || 0) > 0 && (
                    <button
                      onClick={() => { closeMenu(); setProfilePicked(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${dark ? 'text-blue-300 hover:bg-white/5' : 'text-blue-600 hover:bg-gray-50'} transition-colors border-b ${dark ? 'border-white/10' : 'border-gray-200'}`}
                    >
                      <KeyRound size={12} /> Home screen
                    </button>
                  )}

                  <button
                    onClick={() => { closeMenu(); logout(); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs ${dark ? 'text-red-400 hover:bg-white/5' : 'text-red-500 hover:bg-gray-50'} transition-colors`}
                  >
                    <LogOut size={12} /> Log Out
                  </button>
                </>
              )}

              {menuView === 'pin' && (
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => setMenuView('menu')}
                      className={`${dark ? 'text-white/40 hover:text-white/70' : 'text-gray-400 hover:text-gray-700'} transition-colors`}
                    >
                      <ArrowLeft size={13} />
                    </button>
                    <p className={`text-[12px] font-semibold ${dark ? 'text-white/80' : 'text-gray-800'}`}>
                      Home screen PIN
                    </p>
                    <button
                      onClick={closeMenu}
                      className={`ml-auto ${dark ? 'text-white/30 hover:text-white/60' : 'text-gray-300 hover:text-gray-600'} transition-colors`}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <form onSubmit={submitPin}>
                    <input
                      ref={pinInputRef}
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      value={pinValue}
                      onChange={e => { setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(''); }}
                      disabled={pinBusy}
                      placeholder="• • • •"
                      className={`w-full text-center text-[20px] tracking-[0.4em] px-3 py-2 rounded-lg outline-none transition-colors disabled:opacity-50 ${
                        dark
                          ? 'bg-white/[0.05] border border-white/[0.10] text-white placeholder-white/20 focus:border-blue-400/50'
                          : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-300 focus:border-blue-400'
                      }`}
                    />
                    {pinError && (
                      <p className="text-[11px] text-rose-400 text-center mt-1.5">{pinError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={pinBusy || pinValue.length < 4}
                      className="mt-2.5 w-full py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {pinBusy ? 'Checking…' : 'View all profiles'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        <MenuBarClock dark={dark} />
      </div>
    </div>
  );
}
