import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { ShieldCheck, Lock, Mail, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { loginSuperAdmin } from '@/store/superAdmin/superAdminThunks';
import { clearSuperAdminError } from '@/store/superAdmin/superAdminSlice';
import { emailField, fieldError } from '@/validation/schemas';

interface SuperAdminLoginValues {
  email: string;
  password: string;
}

// Yup validation schema for Super Admin login
const loginSchema = Yup.object({
  email: emailField('Admin email'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Master password is required'),
});

const inputClass =
  'w-full pl-10 pr-4 py-2.5 bg-surface border rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 text-sm transition-all';

function borderClass(hasError: boolean) {
  return hasError
    ? 'border-error focus:border-error focus:ring-error'
    : 'border-outline/30 focus:border-primary focus:ring-primary';
}

export function SuperAdminLoginForm() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useAppSelector((state) => state.superAdmin);

  useEffect(() => {
    dispatch(clearSuperAdminError());
  }, [dispatch]);

  const formik = useFormik<SuperAdminLoginValues>({
    initialValues: { email: '', password: '' },
    validationSchema: loginSchema,
    onSubmit: async (values) => {
      dispatch(clearSuperAdminError());
      const resultAction = await dispatch(
        loginSuperAdmin({ email: values.email.trim(), password: values.password })
      );

      if (loginSuperAdmin.fulfilled.match(resultAction)) {
        navigate('/admin/dashboard');
      }
    },
  });

  const emailError = fieldError(formik, 'email');
  const passwordError = fieldError(formik, 'password');

  return (
    <div className="relative bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-xl p-8 backdrop-blur-md">
      <div className="flex flex-col items-center mb-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-on-surface">Platform Super Admin</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          Sign in to manage client organizations and gateway infrastructure
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="admin-email"
            className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5"
          >
            Admin Email
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface-variant/60">
              <Mail className="w-4 h-4" />
            </span>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              placeholder="aswin@neurosta.ai"
              aria-invalid={!!emailError}
              {...formik.getFieldProps('email')}
              className={`${inputClass} ${borderClass(!!emailError)}`}
            />
          </div>
          {emailError && <p className="mt-1 text-xs text-error">{emailError}</p>}
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5"
          >
            Master Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface-variant/60">
              <Lock className="w-4 h-4" />
            </span>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              aria-invalid={!!passwordError}
              {...formik.getFieldProps('password')}
              className={`${inputClass} ${borderClass(!!passwordError)}`}
            />
          </div>
          {passwordError && <p className="mt-1 text-xs text-error">{passwordError}</p>}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-2 py-3 px-4 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
        >
          {isLoading ? 'Verifying Credentials...' : 'Sign In as Super Admin'}
        </button>
      </form>
    </div>
  );
}
