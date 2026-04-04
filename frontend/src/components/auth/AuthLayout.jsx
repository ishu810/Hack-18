import { motion } from 'framer-motion';

const MotionSection = motion.section;

function CrestIcon() {
  return (
    <svg viewBox="0 0 64 24" className="h-4 w-auto text-slate-300" fill="none" aria-hidden="true">
      <path d="M3 12h13M48 12h13" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <circle cx="32" cy="12" r="8" stroke="currentColor" strokeWidth="1.2" />
      <path d="M32 4v16M24 12h16" stroke="currentColor" strokeWidth="1.2" opacity="0.8" />
      <path d="M27.8 7.8 36.2 16.2M36.2 7.8 27.8 16.2" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

export default function AuthLayout({
  title,
  children,
  footer,
  pageKey,
  scene = 'login',
  cardWidthClass = 'max-w-[34rem]',
}) {
  const backgroundClass = scene === 'register'
    ? "bg-[linear-gradient(180deg,rgba(8,12,22,0.2),rgba(8,12,22,0.5)),url('/detective.bg.png')]"
    : "bg-[linear-gradient(180deg,rgba(8,12,22,0.2),rgba(8,12,22,0.5)),url('/detective.bg.png')]";

  return (
    <main className="relative min-h-screen w-full">
        <MotionSection
          key={pageKey}
          initial={{ opacity: 0, y: 26, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.985 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className={`relative flex min-h-screen w-full items-center justify-center overflow-hidden border border-slate-300/20 bg-cover bg-center px-4 py-8 shadow-[0_30px_70px_rgba(2,6,23,0.62)] md:px-8 ${backgroundClass}`}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(12,18,31,0.08),rgba(2,6,23,0.62))]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(3,7,16,0.8)]" aria-hidden="true" />

          <div className={`relative z-10 w-full ${cardWidthClass} rounded-2xl border border-white/20 bg-[linear-gradient(165deg,rgba(23,31,49,0.62),rgba(10,16,28,0.54))] p-8 shadow-[0_25px_48px_rgba(2,6,23,0.52),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-10`}>
            <header className="mb-6 text-center">
              <div className="mb-2 flex items-center justify-center gap-2">
                <CrestIcon />
              </div>
              <p className="text-[0.73rem] uppercase tracking-[0.19em] text-slate-200/90">Intel Travel Agency</p>
              <h1 className="mt-3 text-[2rem] font-semibold tracking-tight text-slate-100">{title}</h1>
            </header>

            {children}

            <div className="mt-6 text-center text-sm text-slate-300/85">{footer}</div>
          </div>
        </MotionSection>
    </main>
  );
}
