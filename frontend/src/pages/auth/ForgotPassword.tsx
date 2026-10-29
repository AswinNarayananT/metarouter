import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { requestPasswordReset } from '@/store/workspace/workspaceThunks';
import { emailField, fieldError } from '@/validation/schemas';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { AuthFooter } from '@/components/auth/AuthFooter';

const forgotSchema = Yup.object({ email: emailField() });

// "Forgot password?" from the login page: emails a one-time link to /reset-password
export function ForgotPassword() {
  const dispatch = useAppDispatch();
  // The server's reply is the same whether or not the email has an account
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formik = useFormik({
    initialValues: { email: '' },
    validationSchema: forgotSchema,
    onSubmit: async (values) => {
      setError(null);
      const result = await dispatch(requestPasswordReset(values.email.trim()));
      if (requestPasswordReset.fulfilled.match(result)) setSentMessage(result.payload);
      else setError(result.payload as string);
    },
  });

  const emailError = fieldError(formik, 'email');

  return (
    <div className="bg-surface font-body text-on-surface antialiased min-h-screen flex flex-col justify-between">
      <AuthHeader />

      <main className="w-full flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 shadow-xl">
          {sentMessage ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <MailCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-on-surface">Check your email</h2>
              <p className="text-sm text-on-surface-variant">{sentMessage}</p>
              <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-on-surface">Forgot your password?</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  Enter the email you sign in with and we'll send you a link to choose a new password.
                </p>
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
                      autoFocus
                      placeholder="you@company.com"
                      aria-invalid={!!emailError}
                      {...formik.getFieldProps('email')}
                      className={`w-full pl-10 pr-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none ${
                        emailError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary'
                      }`}
                    />
                  </div>
                  {emailError && <p className="mt-1 text-xs text-error">{emailError}</p>}
                </div>

                <button
                  type="submit"
                  disabled={formik.isSubmitting}
                  className="w-full py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {formik.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send reset link
                </button>
              </form>

              <Link to="/login" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </>
          )}
        </div>
      </main>

      <AuthFooter />
    </div>
  );
}
