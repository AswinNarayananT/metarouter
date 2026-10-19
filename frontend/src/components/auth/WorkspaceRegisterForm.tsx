import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageSquare,
  UserRound,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32);
}

function getPasswordStrength(password: string): { label: string; score: number } {
  const len = password.length;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNum = /\d/.test(password);
  const hasSym = /[^a-zA-Z0-9]/.test(password);
  const count = [len >= 8, hasUpper || hasLower, hasNum, hasSym].filter(Boolean).length;
  if (!password) return { label: 'None', score: 0 };
  if (count <= 1) return { label: 'Weak', score: 1 };
  if (count === 2) return { label: 'Fair', score: 2 };
  if (count === 3) return { label: 'Good', score: 3 };
  return { label: 'Strong', score: 4 };
}

export function WorkspaceRegisterForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    workspace: '',
    fullName: '',
    email: '',
    password: 'FlowHub!2026#',
    agreed: true,
  });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const slug = toSlug(form.workspace);
  const strength = getPasswordStrength(form.password);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
    await new Promise((r) => setTimeout(r, 800));
    navigate('/dashboard/setup');
  }

  function handleGoogleSSO() {
    window.alert('Redirecting to Google OAuth…');
  }

  function handleMicrosoftSSO() {
    window.alert('Redirecting to Microsoft SSO…');
  }

  return (
    <div className="relative w-full bg-surface-container-lowest rounded-xl shadow-xl shadow-surface-container/60 p-6 sm:p-10 z-10 transition-all duration-300 border border-outline-variant/30">
      {/* Header / Brand Pill */}
      <div className="flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary mb-4 shadow-sm border border-outline-variant/30">
          <MessageSquare className="size-4 text-tertiary" fill="currentColor" />
          <span className="text-[11px] font-bold tracking-wide text-on-surface uppercase">
            MetaRouter AI Engine
          </span>
          <span className="size-1.5 rounded-full bg-tertiary" />
          <span className="text-[11px] font-semibold text-tertiary">Meta Verified</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-on-surface mb-2 tracking-tight">
          Create your workspace
        </h1>
        <p className="text-sm text-on-surface-variant max-w-sm leading-relaxed">
          Automate customer chats in minutes. 14-day free trial, no credit card required.
        </p>
      </div>

      {/* Quick SSO Options */}
      <div className="grid grid-cols-2 gap-3 mt-6">
        <button
          type="button"
          onClick={handleGoogleSSO}
          className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-colors duration-150 border border-outline-variant/30 group text-sm font-semibold cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              fill="#EA4335"
            />
          </svg>
          <span>Google SSO</span>
        </button>

        <button
          type="button"
          onClick={handleMicrosoftSSO}
          className="flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-colors duration-150 border border-outline-variant/30 group text-sm font-semibold cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 23 23">
            <path d="M1 1h10v10H1z" fill="#f35325" />
            <path d="M12 1h10v10H12z" fill="#81bc06" />
            <path d="M1 12h10v10H1z" fill="#05a6f0" />
            <path d="M12 12h10v10H12z" fill="#ffba08" />
          </svg>
          <span>Microsoft</span>
        </button>
      </div>

      {/* Divider */}
      <div className="relative my-6 flex items-center justify-center">
        <div className="w-full h-px bg-surface-container-high" />
        <span className="absolute px-3 bg-surface-container-lowest text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
          or sign up with work email
        </span>
      </div>

      {/* Registration Form */}
      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Workspace Name */}
        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1.5" htmlFor="workspace">
            Workspace or Company Name
          </label>
          <div className="relative flex items-center">
            <Building2 className="absolute left-3.5 size-5 text-outline pointer-events-none" />
            <input
              id="workspace"
              name="workspace"
              type="text"
              required
              value={form.workspace}
              onChange={handleChange}
              placeholder="e.g. Acme Retail & Co."
              className="w-full pl-11 pr-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline-variant text-sm font-medium focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 focus:border-primary border border-transparent transition-all duration-150"
            />
          </div>
          {slug && (
            <p className="mt-1.5 text-[11px] text-on-surface-variant font-mono">
              Workspace URL: <span className="text-primary font-semibold">app.metarouter.ai/</span>
              <span className="text-secondary font-semibold">{slug}</span>
            </p>
          )}
        </div>

        {/* Full Name */}
        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1.5" htmlFor="fullName">
            Your Full Name
          </label>
          <div className="relative flex items-center">
            <UserRound className="absolute left-3.5 size-5 text-outline pointer-events-none" />
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              value={form.fullName}
              onChange={handleChange}
              placeholder="e.g. Alex Morgan"
              className="w-full pl-11 pr-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline-variant text-sm font-medium focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 focus:border-primary border border-transparent transition-all duration-150"
            />
          </div>
        </div>

        {/* Work Email */}
        <div>
          <label className="block text-xs font-semibold text-on-surface mb-1.5" htmlFor="email">
            Business Email
          </label>
          <div className="relative flex items-center">
            <Mail className="absolute left-3.5 size-5 text-outline pointer-events-none" />
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              placeholder="alex@acmeretail.com"
              className="w-full pl-11 pr-4 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline-variant text-sm font-medium focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 focus:border-primary border border-transparent transition-all duration-150"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-on-surface" htmlFor="password">
              Create Password
            </label>
            <span className="text-[11px] text-primary font-semibold">
              Security: {strength.label}
            </span>
          </div>
          <div className="relative flex items-center">
            <Lock className="absolute left-3.5 size-5 text-outline pointer-events-none" />
            <input
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              required
              minLength={8}
              value={form.password}
              onChange={handleChange}
              className="w-full pl-11 pr-11 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline-variant text-sm font-medium focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20 focus:border-primary border border-transparent transition-all duration-150"
            />
            <button
              id="togglePassword"
              type="button"
              onClick={() => setPasswordVisible((v) => !v)}
              className="absolute right-3.5 text-outline hover:text-on-surface focus:outline-none transition-colors cursor-pointer"
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            >
              {passwordVisible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>

          {/* Password Strength Indicator Bars */}
          <div className="mt-2 grid grid-cols-4 gap-1.5" aria-label="Password strength meter">
            {[1, 2, 3, 4].map((bar) => (
              <div
                key={bar}
                className={clsx(
                  'h-1.5 rounded-full transition-all duration-200',
                  bar <= strength.score ? 'bg-tertiary' : 'bg-surface-container-high',
                )}
              />
            ))}
          </div>

          {/* Requirements Checklist */}
          <div className="flex items-center gap-4 mt-2 text-[11px] text-on-surface-variant font-medium">
            <span
              className={clsx(
                'flex items-center gap-1 font-semibold',
                form.password.length >= 8 ? 'text-tertiary' : 'text-outline',
              )}
            >
              <CheckCircle2 className="size-3.5 shrink-0" fill="currentColor" />
              8+ Characters
            </span>
            <span
              className={clsx(
                'flex items-center gap-1 font-semibold',
                /[^a-zA-Z0-9]/.test(form.password) && /\d/.test(form.password)
                  ? 'text-tertiary'
                  : 'text-outline',
              )}
            >
              <CheckCircle2 className="size-3.5 shrink-0" fill="currentColor" />
              Special symbol &amp; number
            </span>
          </div>
        </div>

        {/* Compliance & Consent */}
        <div className="pt-2">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              name="agreed"
              type="checkbox"
              required
              checked={form.agreed}
              onChange={handleChange}
              className="mt-1 size-4 rounded accent-primary cursor-pointer"
            />
            <span className="text-xs text-on-surface-variant leading-relaxed">
              I agree to the{' '}
              <a className="text-primary font-semibold hover:underline" href="#terms">
                Terms of Service
              </a>{' '}
              and{' '}
              <a className="text-primary font-semibold hover:underline" href="#privacy">
                Privacy Policy
              </a>
              , including Meta’s official WhatsApp Business API compliance guidelines.
            </span>
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-3">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!form.agreed}
            className="w-full py-3 px-6 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all duration-200"
          >
            {submitted ? (
              <>
                <CheckCircle2 className="size-5" />
                <span>Workspace Created!</span>
              </>
            ) : (
              <>
                <span>Create Account</span>
                <ArrowRight className="size-5" />
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Account Switcher Link */}
      <div className="mt-6 text-center">
        <p className="text-sm text-on-surface-variant">
          Already managing an inbox?{' '}
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline ml-1"
          >
            Log in here
          </Link>
        </p>
      </div>
    </div>
  );
}