import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Shield, Check, Circle, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { verifyInvitationToken, acceptWorkspaceInvitation } from '@/store/workspace/workspaceThunks';
import {
  PASSWORD_RULES,
  confirmPasswordField,
  fieldError,
  nameField,
  strongPasswordField,
} from '@/validation/schemas';

interface AcceptInvitationValues {
  name: string;
  password: string;
  confirm_password: string;
}

const acceptSchema = Yup.object({
  name: nameField('Full name'),
  password: strongPasswordField(),
  confirm_password: confirmPasswordField('password'),
});

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border bg-surface text-on-surface text-xs focus:outline-none focus:ring-2';

function borderClass(hasError: boolean) {
  return hasError ? 'border-error focus:ring-error/40' : 'border-outline-variant/50 focus:ring-primary/50';
}

export function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const {
    isVerifyingInvite,
    verifiedInvite,
    isAcceptingInvite,
    acceptSuccess,
    error
  } = useAppSelector((state) => state.workspace);

  // 1. Verify token on initial load
  useEffect(() => {
    if (token) {
      dispatch(verifyInvitationToken(token));
    }
  }, [token, dispatch]);

  // 2. Form state — name is pre-filled from the verified invitation
  const formik = useFormik<AcceptInvitationValues>({
    initialValues: {
      name: verifiedInvite?.name ?? '',
      password: '',
      confirm_password: '',
    },
    enableReinitialize: true,
    validationSchema: acceptSchema,
    onSubmit: async (values) => {
      if (!token) return;
      await dispatch(
        acceptWorkspaceInvitation({ token, name: values.name.trim(), password: values.password })
      );
    },
  });

  // Render Token Missing View
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-on-surface">Invalid Invitation Link</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            No invitation token provided. Please make sure you clicked the full URL provided in your invitation link.
          </p>
        </div>
      </div>
    );
  }

  // Render Loading Token Verification View
  if (isVerifyingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs font-medium">Verifying invitation token...</p>
        </div>
      </div>
    );
  }

  // Render Invalid / Expired Token View
  if (error && !verifiedInvite && !acceptSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-on-surface">Invitation Expired or Invalid</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">{error}</p>
          <p className="text-[11px] text-on-surface-variant">
            Please ask your workspace administrator to issue a new invitation.
          </p>
        </div>
      </div>
    );
  }

  // Render Success State View
  if (acceptSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 max-w-md w-full text-center space-y-5 shadow-xl animate-in fade-in zoom-in-95 duration-200">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-on-surface">Account Created Successfully!</h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Your password has been set. You can now log into <strong>{verifiedInvite?.organization_name}</strong> workspace.
            </p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-2.5 bg-primary text-on-primary rounded-xl font-medium text-xs shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Proceed to Login</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const nameError = fieldError(formik, 'name');
  const passwordError = fieldError(formik, 'password');
  const confirmError = fieldError(formik, 'confirm_password');

  // Render Registration Form View
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-8 max-w-md w-full shadow-2xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Shield className="w-5 h-5" />
          </div>
          <h2 className="text-xl font-bold text-on-surface">Join Workspace</h2>
          <p className="text-xs text-on-surface-variant">
            You've been invited to join <strong>{verifiedInvite?.organization_name}</strong> as a <span className="uppercase font-semibold text-primary">{verifiedInvite?.role}</span>.
          </p>
        </div>

        {/* A failed sign-up shows as a toast */}
        <form onSubmit={formik.handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-xs font-medium text-on-surface mb-1">
              Email Address
            </label>
            <input
              id="invite-email"
              type="email"
              disabled
              value={verifiedInvite?.email || ''}
              className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface-variant text-xs cursor-not-allowed opacity-80"
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-xs font-medium text-on-surface mb-1">
              Your Full Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Full Name"
              aria-invalid={!!nameError}
              {...formik.getFieldProps('name')}
              className={`${inputClass} ${borderClass(!!nameError)}`}
            />
            {nameError && <p className="mt-1 text-[11px] text-error">{nameError}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-on-surface mb-1">
              Create Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!passwordError}
              {...formik.getFieldProps('password')}
              className={`${inputClass} ${borderClass(!!passwordError)}`}
            />
            {formik.values.password.length > 0 && (
              <ul className="grid grid-cols-2 gap-1 mt-2">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(formik.values.password);
                  return (
                    <li
                      key={rule.label}
                      className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-on-surface' : 'text-on-surface-variant'}`}
                    >
                      {ok ? <Check className="w-3 h-3 text-primary" /> : <Circle className="w-3 h-3" />}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            )}
            {passwordError && formik.values.password.length === 0 && (
              <p className="mt-1 text-[11px] text-error">{passwordError}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirm_password" className="block text-xs font-medium text-on-surface mb-1">
              Confirm Password
            </label>
            <input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!confirmError}
              {...formik.getFieldProps('confirm_password')}
              className={`${inputClass} ${borderClass(!!confirmError)}`}
            />
            {confirmError && <p className="mt-1 text-[11px] text-error">{confirmError}</p>}
          </div>

          <button
            type="submit"
            disabled={isAcceptingInvite}
            className="w-full py-2.5 bg-primary text-on-primary rounded-xl font-medium text-xs shadow-md hover:bg-primary/90 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 pt-2"
          >
            {isAcceptingInvite ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Complete Account Setup</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
