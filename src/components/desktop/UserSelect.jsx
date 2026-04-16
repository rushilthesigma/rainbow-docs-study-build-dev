import { useState } from 'react';
import { Lock, ArrowLeft } from 'lucide-react';

export default function UserSelect({ parentName, students, onSelectStudent, onSelectParent }) {
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  async function handleParentLogin() {
    if (!pin || pin.length < 4) return;
    setVerifying(true);
    setError(null);
    try {
      await onSelectParent(pin);
    } catch {
      setError('Incorrect PIN');
      setPin('');
    }
    setVerifying(false);
  }

  const dark = document.documentElement.classList.contains('dark');
  const time = new Date();
  const timeStr = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-[3000] flex flex-col items-center justify-center" style={{
      background: dark
        ? 'radial-gradient(ellipse at 20% 50%, rgba(88,28,135,0.4) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(30,58,138,0.5) 0%, transparent 50%), linear-gradient(135deg, #0a0a1a, #0d1117, #0f0a1e)'
        : 'radial-gradient(ellipse at 20% 50%, rgba(167,139,250,0.25) 0%, transparent 50%), linear-gradient(135deg, #e0e7ff, #ede9fe, #e0e7ff)',
    }}>
      {/* Clock */}
      <div className="mb-10 text-center">
        <p className={`text-6xl font-light tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>{timeStr}</p>
        <p className={`text-lg mt-1 ${dark ? 'text-white/60' : 'text-gray-500'}`}>{dateStr}</p>
      </div>

      {/* PIN entry for parent */}
      {showPin ? (
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-4 shadow-xl">
            <Lock size={32} className="text-white" />
          </div>
          <p className={`text-lg font-medium mb-1 ${dark ? 'text-white' : 'text-gray-900'}`}>Parent</p>
          <p className={`text-sm mb-4 ${dark ? 'text-white/40' : 'text-gray-400'}`}>Enter your PIN</p>

          {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}

          <div className="flex gap-2 mb-4">
            {[0,1,2,3].map(i => (
              <div key={i} className={`w-3 h-3 rounded-full ${pin.length > i ? 'bg-white' : dark ? 'bg-white/20' : 'bg-gray-300'}`} />
            ))}
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter') handleParentLogin(); }}
            autoFocus
            className={`w-48 text-center px-4 py-3 rounded-xl border text-lg tracking-[0.5em] outline-none ${dark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
            placeholder="----"
          />

          <button onClick={handleParentLogin} disabled={pin.length < 4 || verifying} className="mt-4 px-6 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            {verifying ? 'Verifying...' : 'Unlock'}
          </button>

          <button onClick={() => { setShowPin(false); setPin(''); setError(null); }} className={`mt-3 text-xs ${dark ? 'text-white/40 hover:text-white/60' : 'text-gray-400 hover:text-gray-600'}`}>
            <ArrowLeft size={12} className="inline mr-1" /> Back
          </button>
        </div>
      ) : (
        /* User selection grid */
        <div className="flex flex-wrap gap-6 justify-center max-w-lg">
          {/* Students */}
          {students.map(s => (
            <button key={s.id} onClick={() => onSelectStudent(s.id)} className="flex flex-col items-center gap-2 group">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg transition-transform group-hover:scale-105 ${dark ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white'}`}>
                {s.avatar || s.name[0]?.toUpperCase()}
              </div>
              <span className={`text-sm font-medium ${dark ? 'text-white/80 group-hover:text-white' : 'text-gray-700 group-hover:text-gray-900'}`}>{s.name}</span>
            </button>
          ))}

          {/* Parent */}
          <button onClick={() => setShowPin(true)} className="flex flex-col items-center gap-2 group">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 ${dark ? 'bg-gradient-to-br from-gray-600 to-gray-800 text-white' : 'bg-gradient-to-br from-gray-400 to-gray-600 text-white'}`}>
              <Lock size={28} />
            </div>
            <span className={`text-sm font-medium ${dark ? 'text-white/80 group-hover:text-white' : 'text-gray-700 group-hover:text-gray-900'}`}>Parent</span>
          </button>
        </div>
      )}
    </div>
  );
}
