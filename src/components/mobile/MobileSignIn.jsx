import { useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import { googleLogin } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { isNativeApp } from '../../native/platform';
import { prepareNativeGoogleSignIn, signInWithNativeGoogle } from '../../native/googleAuth';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

export default function MobileSignIn() {
  const { login } = useAuth();
  const googleButtonRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function finishGoogleSignIn(credential) {
    setBusy(true);
    setError('');
    try {
      const data = await googleLogin(credential);
      if (data.success) login(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (isNativeApp) {
      let active = true;
      prepareNativeGoogleSignIn()
        .then(() => { if (active) setReady(true); })
        .catch(() => { if (active) setReady(false); });
      return () => { active = false; };
    }

    let cancelled = false;
    const initialize = () => {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
        callback: (response) => finishGoogleSignIn(response.credential),
        use_fedcm_for_prompt: true,
      });
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        width: Math.min(420, Math.max(280, googleButtonRef.current.offsetWidth)),
      });
      setReady(true);
    };

    let script = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    if (window.google?.accounts?.id) initialize();
    else script.addEventListener('load', initialize);
    return () => {
      cancelled = true;
      script.removeEventListener('load', initialize);
    };
  }, []);

  async function handleNativeSignIn() {
    if (!isNativeApp || busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      const data = await signInWithNativeGoogle();
      if (data.success) login(data.user, data.token);
    } catch (err) {
      setError(err.message || 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#0a0a14] text-white selection:bg-blue-400/30">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-[calc(20px+env(safe-area-inset-top,0px))]">
        <header className="text-[15px] font-semibold tracking-[-0.02em] text-white/90">
          RushilAI
        </header>

        <section className="flex min-h-0 flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="animate-fade-up">
            <div className="signin-book-intro mx-auto mb-7 grid h-16 w-16 place-items-center rounded-[22px] bg-blue-500 text-white">
              <BookOpen className="signin-book-glyph" size={29} strokeWidth={1.9} />
            </div>
            <h1 className="text-[40px] font-bold leading-none tracking-[-0.045em] text-white">
              Learn anything.
            </h1>

            {error ? (
              <p role="alert" className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-center text-[12px] text-rose-200">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <div className="relative h-12 w-full overflow-hidden rounded-2xl">
          <button
            type="button"
            onClick={handleNativeSignIn}
            disabled={busy || (isNativeApp && !ready)}
            className="flex h-full w-full items-center justify-center gap-3 rounded-2xl bg-blue-500 px-5 text-[14px] font-bold text-white transition-colors hover:bg-blue-400 active:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : null}
            {busy ? 'Signing in…' : 'Continue with Google'}
          </button>
          {!isNativeApp ? (
            <div
              ref={googleButtonRef}
              className={`absolute inset-0 overflow-hidden opacity-[0.001] ${ready ? 'cursor-pointer' : 'pointer-events-none'}`}
              aria-hidden="true"
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
