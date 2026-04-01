import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { googleLogin, devLogin } from '../api/auth';
import { BookOpen, Sparkles, Brain, Target, ArrowRight } from 'lucide-react';
import Button from '../components/shared/Button';
import { useEffect, useRef, useState } from 'react';

export default function LandingPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);

  useEffect(() => {
    // Load Google Identity Services
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
          callback: handleGoogleResponse,
        });
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline',
            size: 'large',
            width: 300,
            text: 'continue_with',
            shape: 'pill',
          });
        }
      }
    };
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  async function handleGoogleResponse(response) {
    setLoading(true);
    try {
      const data = await googleLogin(response.credential);
      if (data.success) {
        login(data.user, data.token);
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Login failed:', err);
    }
    setLoading(false);
  }

  // Demo login for development (bypasses Google OAuth)
  async function handleDemoLogin() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: 'demo' }),
      });
      // If Google is not configured, use demo mode via sync
      if (!res.ok) {
        // Create a pseudo-session for demo
        const demoRes = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: {} }),
        });
        if (!demoRes.ok) throw new Error('Demo login not available');
      }
    } catch {}
    setLoading(false);
  }

  const features = [
    { icon: Brain, title: 'AI-Powered Curricula', desc: 'Generate structured learning paths on any topic with Claude AI' },
    { icon: Sparkles, title: 'Adaptive Learning', desc: 'Customize difficulty, style, tone, and pace to match how you learn' },
    { icon: Target, title: 'Track Progress', desc: 'Complete lessons, build streaks, and see your knowledge grow' },
  ];

  return (
    <div className="min-h-screen bg-[#F4F5F7] dark:bg-[#0D0D14]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 h-16">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <BookOpen size={18} className="text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900 dark:text-white">Covalent</span>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-sm font-medium mb-6">
          <Sparkles size={14} />
          AI-Powered Learning
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white leading-tight mb-4">
          Learn anything with{' '}
          <span className="text-blue-600">personalized curricula</span>
        </h1>

        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto mb-10">
          Covalent generates structured, adaptive learning paths tailored to your pace and style. Powered by AI, designed for you.
        </p>

        {/* Google Sign In */}
        <div className="flex flex-col items-center gap-4">
          <div ref={googleBtnRef} className="flex justify-center" />
          <p className="text-xs text-gray-400">Sign in with Google to get started</p>
          {/* Dev login for testing */}
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const data = await devLogin('Dev User', 'dev@covalent.test');
                if (data.success) { login(data.user, data.token); navigate('/dashboard'); }
              } catch (err) { console.error(err); }
              setLoading(false);
            }}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-blue-500 transition-colors underline"
          >
            {loading ? 'Signing in...' : 'Dev Login (testing)'}
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-5">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white dark:bg-[#161622] rounded-xl border border-gray-200 dark:border-[#2A2A40] p-6">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                <Icon size={20} />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
