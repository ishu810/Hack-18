import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AuthSuccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/agent-home', { replace: true });
    }, 500);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/70 p-6 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Authentication Complete</p>
        <h1 className="mt-2 text-2xl font-semibold">Signing You In</h1>
        <p className="mt-2 text-sm text-slate-300">Redirecting to your agent dashboard...</p>
      </div>
    </main>
  );
}