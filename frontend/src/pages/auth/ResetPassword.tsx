import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Check, CheckCircle2, Circle, KeyRound, Loader2 } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { resetPassword, verifyPasswordResetToken } from '@/store/workspace/workspaceThunks';
import { PASSWORD_RULES, confirmPasswordField, fieldError, strongPasswordField } from '@/validation/schemas';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { AuthFooter } from '@/components/auth/AuthFooter';

const resetSchema = Yup.object({
  password: strongPasswordField(),
  confirm_password: confirmPasswordField('password'),
});

const inputClass = 'w-full px-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none';

// The link from the "forgot password" email: /reset-password?token=…
export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  // The link is checked first; "invalid" covers a missing, expired or already-used link
  const [check, setCheck] = useState<{ email: string } | { error: string } | null>(token ? null : { error: 'This link is incomplete. Open the full link from the email, or request a new one.' });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    dispatch(verifyPasswordResetToken(token)).then((result) => {
      if (verifyPasswordResetToken.fulfilled.match(result)) setCheck(result.payload);
      else setCheck({ error: result.payload as string });
    });
  }, [dispatch, token]);

  const formik = useFormik({
    initialValues: { password: '', confirm_password: '' },
    validationSchema: resetSchema,
    onSubmit: async (values) => {
      if (!token) return;
      setSubmitError(null);
      const result = await dispatch(resetPassword({ token, password: values.password }));
      if (resetPassword.fulfilled.match(result)) setDoneMessage(result.payload);
      else setSubmitError(result.payload as string);
    },
  });

  const passwordError = fieldError(formik, 'password');
  const confirmError = fieldError(formik, 'confirm_password');

  return (
    <div className="bg-surface font-body text-on-surface antialiased min-h-screen flex flex-col justify-between">
      <AuthHeader />

      <main className="w-full flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 shadow-xl">
          {!check ? (
            <p className="flex items-center justify-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking your link…
            </p>
          ) : 'error' in check ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-on-surface">Link not valid</h2>
              <p className="text-sm text-on-surface-variant">{check.error}</p>
              <Link
                to="/forgot-password"
                className="inline-block px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90"
              >
                Request a new link
              </Link>
            </div>
          ) : doneMessage ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-on-surface">Password reset</h2>
              <p className="text-sm text-on-surface-variant">{doneMessage}</p>
              <p className="text-xs text-on-surface-variant">You were signed out on every other device.</p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 shadow-md cursor-pointer"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-on-surface">Choose a new password</h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  For <strong className="text-on-surface">{check.email}</strong>
                </p>
              </div>

              {submitError && (
                <div className="mb-6 p-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
                {/* Lets password managers save the new password under the right account */}
                <input type="email" autoComplete="username" value={check.email} readOnly hidden />

                <div>
                  <label htmlFor="password" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    autoFocus
                    aria-invalid={!!passwordError}
                    {...formik.getFieldProps('password')}
                    className={`${inputClass} ${passwordError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary'}`}
                  />
                  {formik.values.password.length > 0 && (
                    <ul className="grid grid-cols-2 gap-1 mt-2">
                      {PASSWORD_RULES.map((rule) => {
                        const ok = rule.test(formik.values.password);
                        return (
                          <li key={rule.label} className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                            {ok ? <Check className="w-3 h-3 text-primary" /> : <Circle className="w-3 h-3" />}
                            {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {passwordError && formik.values.password.length === 0 && <p className="mt-1 text-xs text-error">{passwordError}</p>}
                </div>

                <div>
                  <label htmlFor="confirm_password" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
                    Confirm new password
                  </label>
                  <input
                    id="confirm_password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!confirmError}
                    {...formik.getFieldProps('confirm_password')}
                    className={`${inputClass} ${confirmError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary'}`}
                  />
                  {confirmError && <p className="mt-1 text-xs text-error">{confirmError}</p>}
                </div>

                <button
                  type="submit"
                  disabled={formik.isSubmitting}
                  className="w-full py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {formik.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Reset password
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <AuthFooter />
    </div>
  );
}
