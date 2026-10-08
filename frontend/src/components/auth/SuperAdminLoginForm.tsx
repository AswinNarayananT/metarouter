import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, AlertCircle } from 'lucide-react';
import * as Yup from 'yup';
import { useAppDispatch, useAppSelector } from '@/store';
import { loginSuperAdmin } from '@/store/superAdmin/superAdminThunks';
import { clearSuperAdminError } from '@/store/superAdmin/superAdminSlice';

// Define Yup validation schema for Super Admin login
const loginSchema = Yup.object().shape({
  email: Yup.string()
    .email('Please enter a valid email address')
    .required('Admin email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Master password is required'),
});

export function SuperAdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useAppSelector((state) => state.superAdmin);

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError('');
    dispatch(clearSuperAdminError());

    try {
      // Validate inputs using Yup before dispatching
      await loginSchema.validate({ email, password }, { abortEarly: false });

      // Dispatch Redux async thunk
      const resultAction = await dispatch(loginSuperAdmin({ email, password }));

      if (loginSuperAdmin.fulfilled.match(resultAction)) {
        navigate('/admin/dashboard');
      }
    } catch (err: any) {
      if (err instanceof Yup.ValidationError) {
        // Grab the first validation error message
        setValidationError(err.errors[0]);
      } else {
        setValidationError(err.message || 'An unexpected error occurred.');
      }
    }
  };

  // Display either Yup validation errors or Redux API errors
  const displayError = validationError || error;

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

      {displayError && (
        <div className="mb-4 p-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
            Admin Email
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface-variant/60">
              <Mail className="w-4 h-4" />
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="aswin@neurosta.ai"
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
            Master Password
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-on-surface-variant/60">
              <Lock className="w-4 h-4" />
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all"
            />
          </div>
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