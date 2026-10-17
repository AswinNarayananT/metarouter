import { useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { User, Shield, KeyRound, Save, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, Container } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { updateSuperAdminProfile, changeSuperAdminPassword } from '@/store/superAdmin/superAdminThunks';
import { resetSuperAdminSettingsState } from '@/store/superAdmin/superAdminSlice';
import {
  PASSWORD_RULES,
  confirmPasswordField,
  fieldError,
  nameField,
  strongPasswordField,
} from '@/validation/schemas';

interface ProfileValues {
  name: string;
}

interface PasswordValues {
  current_password: string;
  new_password: string;
  confirm_password: string;
}

const profileSchema = Yup.object({
  name: nameField('Full name'),
});

const passwordSchema = Yup.object({
  current_password: Yup.string().required('Current password is required'),
  new_password: strongPasswordField('New password').notOneOf(
    [Yup.ref('current_password')],
    'New password must be different from the current password'
  ),
  confirm_password: confirmPasswordField('new_password'),
});

const inputClass =
  'w-full px-4 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2';

function borderClass(hasError: boolean) {
  return hasError ? 'border-error focus:ring-error/40' : 'border-outline-variant/50 focus:ring-primary/50';
}

function Banner({ type, message }: { type: 'success' | 'error'; message: string }) {
  const isError = type === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium border ${
        isError ? 'bg-error/10 text-error border-error/20' : 'bg-primary/10 text-primary border-primary/20'
      }`}
    >
      {isError ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

export function SuperAdminSettings() {
  const dispatch = useAppDispatch();
  const {
    user,
    isSavingProfile,
    profileSuccess,
    profileError,
    isChangingPassword,
    passwordSuccess,
    passwordError,
  } = useAppSelector((state) => state.superAdmin);

  // Clear success / error banners when leaving the page
  useEffect(() => {
    return () => {
      dispatch(resetSuperAdminSettingsState());
    };
  }, [dispatch]);

  const profileForm = useFormik<ProfileValues>({
    initialValues: { name: user?.name ?? '' },
    enableReinitialize: true,
    validationSchema: profileSchema,
    onSubmit: async (values) => {
      await dispatch(updateSuperAdminProfile({ name: values.name.trim() }));
    },
  });

  const passwordForm = useFormik<PasswordValues>({
    initialValues: { current_password: '', new_password: '', confirm_password: '' },
    validationSchema: passwordSchema,
    onSubmit: async (values, { resetForm }) => {
      const result = await dispatch(
        changeSuperAdminPassword({
          current_password: values.current_password,
          new_password: values.new_password,
        })
      );
      if (changeSuperAdminPassword.fulfilled.match(result)) {
        resetForm();
      }
    },
  });

  // Hide a stale result banner once the user starts editing again
  const clearBannersOnEdit = (handler: (e: React.ChangeEvent<HTMLInputElement>) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handler(e);
      if (profileSuccess || profileError || passwordSuccess || passwordError) {
        dispatch(resetSuperAdminSettingsState());
      }
    };

  const nameError = fieldError(profileForm, 'name');
  const currentError = fieldError(passwordForm, 'current_password');
  const newError = fieldError(passwordForm, 'new_password');
  const confirmError = fieldError(passwordForm, 'confirm_password');

  return (
    <Container size="md">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Super Admin Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Manage your master profile credentials and platform security.</p>
      </div>

      <div className="grid gap-6">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <User className="size-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Profile Details</h2>
          </div>

          <form onSubmit={profileForm.handleSubmit} noValidate className="space-y-4">
            {profileSuccess && <Banner type="success" message="Admin profile updated successfully." />}
            {profileError && <Banner type="error" message={profileError} />}

            <div>
              <label htmlFor="sa-name" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
                Full Name
              </label>
              <input
                id="sa-name"
                type="text"
                autoComplete="name"
                aria-invalid={!!nameError}
                {...profileForm.getFieldProps('name')}
                onChange={clearBannersOnEdit(profileForm.handleChange)}
                className={`${inputClass} ${borderClass(!!nameError)}`}
              />
              {nameError && <p className="mt-1 text-xs text-error">{nameError}</p>}
            </div>

            <div>
              <label htmlFor="sa-email" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
                Email Address
              </label>
              <input
                id="sa-email"
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-4 py-2.5 bg-surface-container/50 border border-outline-variant/30 rounded-xl text-sm text-on-surface-variant cursor-not-allowed opacity-80"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">Super admin email cannot be changed from UI.</p>
            </div>

            <div>
              <span className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Role Privilege</span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                <Shield className="size-3.5" />
                <span>Super Administrator</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" disabled={isSavingProfile || !profileForm.dirty}>
                <Save className="size-4" />
                <span>{isSavingProfile ? 'Saving...' : 'Save Profile'}</span>
              </Button>
            </div>
          </form>
        </Card>

        {/* Security / Password Card */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <KeyRound className="size-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Security & Password</h2>
          </div>

          <form onSubmit={passwordForm.handleSubmit} noValidate className="space-y-4">
            {passwordSuccess && <Banner type="success" message="Password changed successfully." />}
            {passwordError && <Banner type="error" message={passwordError} />}

            <div>
              <label htmlFor="sa-current" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
                Current Password
              </label>
              <input
                id="sa-current"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!currentError}
                {...passwordForm.getFieldProps('current_password')}
                onChange={clearBannersOnEdit(passwordForm.handleChange)}
                className={`${inputClass} ${borderClass(!!currentError)}`}
              />
              {currentError && <p className="mt-1 text-xs text-error">{currentError}</p>}
            </div>

            <div>
              <label htmlFor="sa-new" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
                New Password
              </label>
              <input
                id="sa-new"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!newError}
                {...passwordForm.getFieldProps('new_password')}
                onChange={clearBannersOnEdit(passwordForm.handleChange)}
                className={`${inputClass} ${borderClass(!!newError)}`}
              />
              {passwordForm.values.new_password.length > 0 && (
                <ul className="grid grid-cols-2 gap-1 mt-2">
                  {PASSWORD_RULES.map((rule) => {
                    const ok = rule.test(passwordForm.values.new_password);
                    return (
                      <li
                        key={rule.label}
                        className={`text-[11px] ${ok ? 'text-primary' : 'text-on-surface-variant'}`}
                      >
                        {ok ? '✓' : '•'} {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}
              {newError && <p className="mt-1 text-xs text-error">{newError}</p>}
            </div>

            <div>
              <label htmlFor="sa-confirm" className="block text-xs font-medium text-on-surface-variant uppercase mb-1">
                Confirm New Password
              </label>
              <input
                id="sa-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                aria-invalid={!!confirmError}
                {...passwordForm.getFieldProps('confirm_password')}
                onChange={clearBannersOnEdit(passwordForm.handleChange)}
                className={`${inputClass} ${borderClass(!!confirmError)}`}
              />
              {confirmError && <p className="mt-1 text-xs text-error">{confirmError}</p>}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" disabled={isChangingPassword}>
                <Lock className="size-4" />
                <span>{isChangingPassword ? 'Updating...' : 'Update Password'}</span>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Container>
  );
}
