import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthButton from '../components/auth/AuthButton';
import AuthInput from '../components/auth/AuthInput';
import AuthLayout from '../components/auth/AuthLayout';
import { loginUser } from '../api';

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
      </MotionForm>
    </AuthLayout>
  );
}