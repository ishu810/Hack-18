import { useId, useState } from 'react';

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
        <path
          d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3 4.5 20 20M2 12s3.5-6 10-6c2.4 0 4.4.8 6 1.9M22 12s-3.5 6-10 6c-2.4 0-4.4-.8-6-1.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M9.7 9.7A3.2 3.2 0 0 1 14.3 14.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function AuthInput({
  label,
  type = 'text',
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  required = false,
}) {
  const generatedId = useId();
  const id = `${name || 'field'}-${generatedId}`;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          className="w-full rounded-lg border border-slate-200/25 bg-slate-900/55 px-4 py-3 text-[0.95rem] text-slate-50 outline-none transition duration-200 placeholder:text-slate-400 focus:border-indigo-400/70 focus:bg-slate-900/75 focus:ring-2 focus:ring-indigo-400/25"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-3 flex items-center text-slate-400 transition hover:text-slate-200"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon open={showPassword} />
          </button>
        )}
      </div>
    </div>
  );
}
