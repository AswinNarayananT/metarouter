import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { loginWorkspaceUser } from '@/store/workspace/workspaceThunks';
import { clearWorkspaceError } from '@/store/workspace/workspaceSlice';
import { emailField, fieldError } from '@/validation/schemas';
import type { LoginErrorPayload } from '@/types/workspaceTypes';

interface LoginFormValues {
  email: string;
  password: string;
}

const loginSchema = Yup.object({
  email: emailField(),
  password: Yup.string().required('Password is required'),
});

const inputClass =
  'w-full pl-10 pr-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none';

// Extract subdomain tunnel (e.g. 'acme' from 'acme.metarouter.ai')
function getOrgSlugFromHostname(): string {
  const parts = window.location.hostname.split('.');
  return parts.length > 1 && parts[0] !== 'www' && parts[0] !== 'admin' ? parts[0] : '';
}

export function LoginForm() {
  const [orgSlug] = useState(getOrgSlugFromHostname);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useAppSelector((state) => state.workspace);
  // Server said this input is wrong; shown under it until its value is changed
  const [rejected, setRejected] = useState<{ field: 'email' | 'password'; message: string; value: string } | null>(null);

  useEffect(() => {
    dispatch(clearWorkspaceError());
  }, [dispatch]);

  const formik = useFormik<LoginFormValues>({
    initialValues: { email: '', password: '' },
    validationSchema: loginSchema,
    onSubmit: async (values) => {
      setRejected(null);
      const resultAction = await dispatch(
        loginWorkspaceUser({
          email: values.email.trim(),
          password: values.password,
          org_slug: orgSlug || 'default',
        })
      );

      if (loginWorkspaceUser.fulfilled.match(resultAction)) {
        navigate('/dashboard');
      } else if (loginWorkspaceUser.rejected.match(resultAction)) {
        // Point at the wrong input and put the cursor there
        const failure = resultAction.payload as LoginErrorPayload | undefined;
        if (failure?.field) {
          setRejected({ field: failure.field, message: failure.message, value: values[failure.field] });
          document.getElementById(failure.field)?.focus();
        }
      }
    },
  });

  const serverErrorFor = (field: 'email' | 'password') =>
    rejected?.field === field && formik.values[field] === rejected.value ? rejected.message : undefined;
  const emailError = fieldError(formik, 'email') || serverErrorFor('email');
  const passwordError = fieldError(formik, 'password') || serverErrorFor('password');

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 shadow-xl relative z-10">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-on-surface">Sign in to your workspace</h2>
        <p className="text-sm text-on-surface-variant mt-1">Enter your workspace credentials below</p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-on-surface-variant/60" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={!!emailError}
              {...formik.getFieldProps('email')}
              className={`${inputClass} ${emailError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary'}`}
            />
          </div>
          {emailError && <p className="mt-1 text-xs text-error">{emailError}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-on-surface-variant/60" />
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              aria-invalid={!!passwordError}
              {...formik.getFieldProps('password')}
              className={`${inputClass} ${passwordError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary'}`}
            />
          </div>
          {passwordError && <p className="mt-1 text-xs text-error">{passwordError}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50"
        >
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
