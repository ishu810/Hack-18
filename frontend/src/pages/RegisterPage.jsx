import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthButton from '../components/auth/AuthButton';
import AuthInput from '../components/auth/AuthInput';
import AuthLayout from '../components/auth/AuthLayout';
import { registerUser } from '../api';

const MotionForm = motion.form;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await registerUser({
        username: form.username.trim().toLowerCase(),
        email: form.email,
        role: 'ranger',
        password: form.password,
      });

      navigate('/login');
    } catch (submitError) {
      setError(submitError.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      pageKey="register"
      scene="register"
      title="Register"
      footer={
        <p>
          Already have an account? <Link to="/login" className="font-medium text-blue-300 transition hover:text-blue-200">Log In Here</Link>
          .
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
          label="Username"
          name="username"
          value={form.username}
          onChange={updateField}
          autoComplete="username"
          placeholder="agent_007"
          required
        />

        <AuthInput
          label="Email Address"
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
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />

        <AuthInput
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          onChange={updateField}
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <AuthButton label="Create Account" loading={loading} />
      </MotionForm>
    </AuthLayout>
  );
}
