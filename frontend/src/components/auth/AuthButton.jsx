import { motion } from 'framer-motion';

const MotionButton = motion.button;

export default function AuthButton({ label, loading, type = 'submit' }) {
  return (
    <MotionButton
      type={type}
      whileHover={{ y: -1.5, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      disabled={loading}
      className="w-full rounded-lg border border-indigo-300/35 bg-linear-to-b from-blue-700/85 to-blue-950/80 px-4 py-3 text-lg font-semibold tracking-[0.01em] text-slate-100 shadow-[0_10px_22px_rgba(30,64,175,0.26),inset_0_1px_0_rgba(255,255,255,0.25)] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 disabled:cursor-not-allowed disabled:opacity-75"
    >
      {loading ? 'Securing channel...' : label}
    </MotionButton>
  );
}
