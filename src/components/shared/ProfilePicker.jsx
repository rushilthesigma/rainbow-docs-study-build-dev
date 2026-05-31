import { useState } from 'react';
import { Shield, KeyRound, ArrowLeft } from 'lucide-react';
import { WALLPAPERS } from '../desktop/DesktopBackground';

// Profile-picker screen — shown after login whenever the family has
// profiles set up. Family manager (admin) requires PIN; children switch freely.
//
// Props:
//   parentName        – display name of the account owner (family manager)
//   students          – [{ id, name, color, avatar }] child profiles
//   parentMode        – { enabled, hasPin } from /api/auth/me
//   onSelectStudent(sid) – child tile selected
//   onSelectAdmin(pin)   – family manager tile selected (after PIN if set)
export default function ProfilePicker({
  parentName, students, parentMode, onSelectStudent, onSelectAdmin,
}) {
  const [selected, setSelected] = useState(null);
  // 'idle' | 'pin' | 'submitting'
  const [stage, setStage] = useState('idle');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);

  const dark = document.documentElement.classList.contains('dark');
  const time = new Date();
  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const GRAD_COLORS = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-amber-400 to-orange-500',
    'from-rose-500 to-pink-600',
    'from-violet-500 to-purple-600',
    'from-sky-400 to-cyan-600',
    'from-lime-400 to-green-600',
    'from-fuchsia-500 to-pink-500',
  ];

  function pickStudent(id) {
    if (selected) return;
    setSelected(id);
    onSelectStudent(id);
  }

  function pickAdmin() {
    if (selected) return;
    if (!parentMode?.hasPin) {
      // No PIN set yet — skip straight through
      setSelected('admin');
      onSelectAdmin('');
      return;
    }
    setStage('pin');
    setError(null);
    setPin('');
  }

  async function submitPin(e) {
    e?.preventDefault?.();
    if (!/^[0-9]{4,6}$/.test(pin)) {
      setError('PIN must be 4–6 digits.');
      return;
    }
    setStage('submitting');
    setError(null);
    try {
      await onSelectAdmin(pin);
      // Caller handles navigation — picker stays in submitting until unmount
    } catch (err) {
      setStage('pin');
      setError(err?.message || 'Incorrect PIN.');
      setPin('');
    }
  }

  const wallpaperUrl = WALLPAPERS.milkyway?.url || WALLPAPERS.earthnight?.url || WALLPAPERS.aurora?.url;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center select-none"
      style={{
        background: dark
          ? 'radial-gradient(ellipse at 20% 50%, rgba(88,28,135,0.4) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(30,58,138,0.5) 0%, transparent 50%), linear-gradient(135deg, #0a0a1a, #0d1117, #0f0a1e)'
          : 'radial-gradient(ellipse at 20% 50%, rgba(167,139,250,0.25) 0%, transparent 50%), linear-gradient(135deg, #e0e7ff, #ede9fe, #e0e7ff)',
      }}
    >
      {/* Background image */}
      {wallpaperUrl && (
        <div className="absolute inset-0 -z-10">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-110 opacity-40"
            style={{ backgroundImage: `url(${wallpaperUrl})` }}
          />
        </div>
      )}

      {/* Clock */}
      <div className="mb-8 text-center">
        <p className={`text-5xl sm:text-6xl font-light tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
          {timeStr}
        </p>
        <p className={`text-base mt-1 ${dark ? 'text-white/60' : 'text-gray-500'}`}>{dateStr}</p>
      </div>

      {stage === 'idle' && (
        <>
          <h2 className={`text-xl sm:text-2xl font-semibold tracking-tight mb-8 ${dark ? 'text-white' : 'text-gray-900'}`}>
            Who&apos;s using this?
          </h2>

          <div className="w-full max-w-2xl px-6">
            {/* ── Family Manager ───────────────────────────────────── */}
            {parentMode?.enabled !== false && (
              <div className="flex justify-center mb-8">
                <button
                  onClick={pickAdmin}
                  disabled={!!selected}
                  className={`flex flex-col items-center gap-2.5 group transition-all ${
                    selected === 'admin' ? 'scale-105' : selected ? 'opacity-40 scale-95' : ''
                  }`}
                >
                  <div
                    className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center shadow-xl transition-transform group-hover:scale-110 group-active:scale-95 ring-2 ring-white/20 ${
                      dark
                        ? 'bg-gradient-to-br from-gray-600 to-gray-800 text-white'
                        : 'bg-gradient-to-br from-gray-500 to-gray-700 text-white'
                    }`}
                  >
                    <Shield size={32} />
                  </div>
                  <span className={`text-sm sm:text-base font-medium ${dark ? 'text-white/80 group-hover:text-white' : 'text-gray-700 group-hover:text-gray-900'} transition-colors`}>
                    Family Manager
                  </span>
                  {parentMode?.hasPin && (
                    <span className={`text-[10px] uppercase tracking-wide ${dark ? 'text-white/35' : 'text-gray-400'}`}>
                      Requires PIN
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* ── Children row ────────────────────────────────────── */}
            {students.length > 0 && (
              <>
                {parentMode?.enabled !== false && (
                  <div className={`border-t mb-6 ${dark ? 'border-white/[0.08]' : 'border-gray-200/60'}`} />
                )}
                <p className={`text-[11px] uppercase tracking-widest font-medium mb-4 text-center ${dark ? 'text-white/35' : 'text-gray-400'}`}>
                  Kids
                </p>
                <div className="flex flex-wrap gap-6 sm:gap-8 justify-center">
                  {students.map((s, i) => (
                    <ProfileTile
                      key={s.id}
                      id={s.id}
                      name={s.name}
                      avatar={s.avatar}
                      gradColor={GRAD_COLORS[i % GRAD_COLORS.length]}
                      selected={selected}
                      onPick={() => pickStudent(s.id)}
                      dark={dark}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {selected && (
            <p className={`mt-8 text-sm animate-pulse ${dark ? 'text-white/50' : 'text-gray-400'}`}>
              Loading profile…
            </p>
          )}
        </>
      )}

      {/* PIN entry for Family Manager */}
      {(stage === 'pin' || stage === 'submitting') && (
        <div className="w-full max-w-sm px-6">
          <button
            onClick={() => { setStage('idle'); setError(null); setPin(''); }}
            disabled={stage === 'submitting'}
            className={`inline-flex items-center gap-1.5 mb-4 text-[13px] ${dark ? 'text-white/55 hover:text-white/85' : 'text-gray-500 hover:text-gray-800'} disabled:opacity-40`}
          >
            <ArrowLeft size={14} /> Back to profiles
          </button>

          <form
            onSubmit={submitPin}
            className={`rounded-2xl p-6 backdrop-blur-xl ${dark ? 'bg-white/[0.04] border border-white/[0.08]' : 'bg-white/80 border border-white/60 shadow-2xl'}`}
          >
            <div className="flex flex-col items-center mb-5">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${dark ? 'bg-blue-500/[0.12] border border-blue-400/[0.20]' : 'bg-blue-50 border border-blue-200'}`}>
                <KeyRound size={24} className={dark ? 'text-blue-300' : 'text-blue-600'} />
              </div>
              <h3 className={`text-[18px] font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
                Family Manager PIN
              </h3>
              <p className={`text-[13px] mt-0.5 ${dark ? 'text-white/45' : 'text-gray-500'}`}>
                Unlocks family manager controls.
              </p>
            </div>

            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={stage === 'submitting'}
              placeholder="• • • •"
              className={`w-full text-center text-[28px] tracking-[0.4em] px-4 py-3 rounded-xl outline-none transition-colors disabled:opacity-50 ${
                dark
                  ? 'bg-white/[0.04] border border-white/[0.10] text-white placeholder-white/20 focus:border-blue-400/50 focus:bg-white/[0.06]'
                  : 'bg-white border border-gray-300 text-gray-900 placeholder-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200/50'
              }`}
            />
            {error && <p className="mt-2 text-[12px] text-rose-400 text-center">{error}</p>}
            <button
              type="submit"
              disabled={stage === 'submitting' || pin.length < 4}
              className={`mt-4 w-full px-4 py-2.5 rounded-xl font-semibold text-[14px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                dark
                  ? 'bg-blue-500 hover:bg-blue-400 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {stage === 'submitting' ? 'Unlocking…' : 'Unlock'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function ProfileTile({ id, name, avatar, gradColor, selected, onPick, dark }) {
  return (
    <button
      onClick={onPick}
      disabled={!!selected}
      className={`flex flex-col items-center gap-2.5 group transition-all ${
        selected === id ? 'scale-105' : selected ? 'opacity-40 scale-95' : ''
      }`}
    >
      <div
        className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-2xl sm:text-3xl font-bold shadow-xl transition-transform group-hover:scale-110 group-active:scale-95 bg-gradient-to-br ${gradColor} text-white ring-2 ring-white/20`}
      >
        {avatar || name[0]?.toUpperCase()}
      </div>
      <span className={`text-sm sm:text-base font-medium ${dark ? 'text-white/80 group-hover:text-white' : 'text-gray-700 group-hover:text-gray-900'} transition-colors`}>
        {name}
      </span>
    </button>
  );
}
