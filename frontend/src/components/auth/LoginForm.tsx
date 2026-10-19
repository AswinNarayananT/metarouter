import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { loginWorkspaceUser } from '@/store/workspace/workspaceThunks';
import { clearWorkspaceError } from '@/store/workspace/workspaceSlice';
import { emailField, fieldError } from '@/validation/schemas';

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

  useEffect(() => {
    dispatch(clearWorkspaceError());
  }, [dispatch]);

  const formik = useFormik<LoginFormValues>({
    initialValues: { email: '', password: '' },
    validationSchema: loginSchema,
    onSubmit: async (values) => {
      const resultAction = await dispatch(
        loginWorkspaceUser({
          email: values.email.trim(),
          password: values.password,
          org_slug: orgSlug || 'default',
        })
      );

      if (loginWorkspaceUser.fulfilled.match(resultAction)) {
        navigate('/dashboard');
      }
    },
  });

  const emailError = fieldError(formik, 'email');
  const passwordError = fieldError(formik, 'password');

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
