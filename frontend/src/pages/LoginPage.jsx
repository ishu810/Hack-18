import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthButton from '../components/auth/AuthButton';
import AuthInput from '../components/auth/AuthInput';
import AuthLayout from '../components/auth/AuthLayout';
import { getGoogleAuthUrl, loginUser } from '../api';

const MotionForm = motion.form;

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleGoogleAuth = () => {
    window.location.href = getGoogleAuthUrl();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginUser({
        email: form.email,
        password: form.password,
      });

      navigate('/agent-home');
    } catch (submitError) {
      setError(submitError.message || 'Unable to connect to server. Please check backend status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      pageKey="login"
      scene="login"
      title="Login"
      cardWidthClass="max-w-[28rem]"
      footer={
        <p>
          New to the Agency?{' '}
          <Link to="/register" className="font-medium text-blue-300 transition hover:text-blue-200">
            Sign Up Here
          </Link>
        </p>
      }
    >
      <MotionForm
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.25 }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        <AuthInput
          label="Email"
          name="email"
          type="email"
          value={form.email}
          onChange={updateField}
          autoComplete="email"
          placeholder="example@domain.com"
          required
        />

        <AuthInput
          label="Password"
          name="password"
          type="password"
          value={form.password}
          onChange={updateField}
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />

        <div className="-mt-1 mb-1 flex justify-end">
          <Link to="/login" className="text-sm text-slate-300/80 transition hover:text-slate-100">
            Forgot Password?
          </Link>
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <AuthButton label="Enter System" loading={loading} />

        <div className="pt-2">
          <div className="relative my-3">
            <div className="h-px w-full bg-slate-600/60" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/80 px-2 text-xs uppercase tracking-[0.18em] text-slate-400">
              Or
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            className="w-full rounded-lg border border-slate-500/60 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-300 hover:bg-slate-800"
          >
            Continue with Google
          </button>
        </div>
      </MotionForm>
    </AuthLayout>
  );
}