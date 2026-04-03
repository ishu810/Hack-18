import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import AuthButton from '../components/auth/AuthButton';
import AuthInput from '../components/auth/AuthInput';
import AuthLayout from '../components/auth/AuthLayout';

const MotionForm = motion.form;

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setLoading(false);
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
          label="Full Name"
          name="fullName"
          value={form.fullName}
          onChange={updateField}
          autoComplete="name"
          placeholder="John Doe"
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

        <AuthButton label="Create Account" loading={loading} />
      </MotionForm>
    </AuthLayout>
  );
}
