import { useEffect, useState } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Lock,
  Globe,
  Phone,
  Mail,
  User,
  Eye,
  EyeOff,
  Check,
  Circle,
  Sparkles,
} from 'lucide-react';
import { api } from '@/api/axios';
import { getApiErrorMessage } from '@/api/errors';
import {
  PASSWORD_RULES,
  confirmPasswordField,
  fieldError,
  nameField,
  strongPasswordField,
} from '@/validation/schemas';
import type {
  VerifyOrganizationInviteResponse,
  CompleteOrganizationOnboardingResponse,
} from '@/types/organizationTypes';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

interface OnboardingFormValues {
  admin_name: string;
  admin_password: string;
  confirm_password: string;
  organization_name: string;
  slug: string;
  support_email: string;
  support_phone: string;
}

const onboardingSchema = Yup.object({
  admin_name: nameField('Full name'),
  admin_password: strongPasswordField('Password'),
  confirm_password: confirmPasswordField('admin_password'),
  organization_name: nameField('Workspace name'),
  slug: Yup.string()
    .trim()
    .test('slug-length', 'Slug must be between 2 and 80 characters', (value) => {
      if (!value) return true;
      const s = toSlug(value);
      return s.length >= 2 && s.length <= 80;
    }),
  support_email: Yup.string().trim().email('Enter a valid support email address'),
  support_phone: Yup.string()
    .trim()
    .test('phone-format', 'Enter a valid phone number (digits, +, -, spaces)', (v) => {
      if (!v) return true;
      return /^\+?[\d\s()-]{6,32}$/.test(v);
    }),
});

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 transition-all';

function borderClass(hasError: boolean) {
  return hasError
    ? 'border-error focus:ring-error/40'
    : 'border-outline-variant/50 focus:ring-primary/50';
}

export function WorkspaceOnboarding() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Emailed links carry the token after "#" (browsers never send that part to the server, so it stays out of logs);
  // "?token=" is still read for links sent before that change
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || searchParams.get('token');
  const navigate = useNavigate();

  const [isVerifying, setIsVerifying] = useState(Boolean(token)); // No token: nothing to verify
  const [verifyData, setVerifyData] = useState<VerifyOrganizationInviteResponse | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<CompleteOrganizationOnboardingResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // 1. Verify token on load
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    api
      .post<VerifyOrganizationInviteResponse>('/api/v1/onboarding/verify', { token })
      .then((res) => {
        if (isMounted) {
          setVerifyData(res.data);
          setIsVerifying(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setVerifyError(
            getApiErrorMessage(err, 'This invitation link is invalid or has expired.')
          );
          setIsVerifying(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  // 2. Form state
  const formik = useFormik<OnboardingFormValues>({
    initialValues: {
      admin_name: '',
      admin_password: '',
      confirm_password: '',
      organization_name: verifyData?.organization_name || '',
      slug: verifyData?.organization_name ? toSlug(verifyData.organization_name) : '',
      support_email: verifyData?.email || '',
      support_phone: '',
    },
    enableReinitialize: true,
    validationSchema: onboardingSchema,
    onSubmit: async (values) => {
      if (!token) return;
      setIsSubmitting(true);
      setSubmitError(null);

      const finalSlug = values.slug.trim() ? toSlug(values.slug) : toSlug(values.organization_name);

      try {
        const response = await api.post<CompleteOrganizationOnboardingResponse>(
          '/api/v1/onboarding/complete',
          {
            token,
            admin_name: values.admin_name.trim(),
            admin_password: values.admin_password,
            organization_name: values.organization_name.trim(),
            slug: finalSlug || undefined,
            support_email: values.support_email.trim() || undefined,
            support_phone: values.support_phone.trim() || undefined,
          }
        );
        setSubmitSuccess(response.data);
      } catch (err) {
        setSubmitError(getApiErrorMessage(err, 'Failed to complete workspace onboarding.'));
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const { values, setFieldValue } = formik;

  // Auto-slug sync when user types organization name (unless user explicitly typed a custom slug)
  const handleOrgNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    formik.handleChange(e);
    if (!slugManuallyEdited) {
      setFieldValue('slug', toSlug(newName));
    }
  };

  // State A: Missing Token
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-on-surface">Invalid Onboarding Link</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            No invitation token was found in this link. Please ensure you clicked the full URL provided in your invitation message.
          </p>
        </div>
      </div>
    );
  }

  // State B: Verifying Link
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs font-medium">Validating invitation token...</p>
        </div>
      </div>
    );
  }

  // State C: Token Invalid or Expired
  if (verifyError || !verifyData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-on-surface">Invitation Expired or Invalid</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">{verifyError}</p>
          <p className="text-[11px] text-on-surface-variant/80">
            Please ask your system administrator to re-issue a workspace invitation link.
          </p>
        </div>
      </div>
    );
  }

  // State D: Successfully Completed Onboarding
  if (submitSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-4">
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto ring-8 ring-primary/5">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              Workspace Activated
            </div>
            <h2 className="text-xl font-bold text-on-surface">Welcome to MetaRouter!</h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Your administrator account and workspace <strong>{submitSuccess.organization_name}</strong> are ready.
            </p>
          </div>

          <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/30 text-left space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-outline-variant/20">
              <span className="text-on-surface-variant">Workspace Name</span>
              <span className="font-semibold text-on-surface">{submitSuccess.organization_name}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-outline-variant/20">
              <span className="text-on-surface-variant">Workspace Slug</span>
              <span className="font-mono text-primary font-medium">{submitSuccess.slug}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-on-surface-variant">Admin Login Email</span>
              <span className="font-medium text-on-surface">{submitSuccess.admin_email}</span>
            </div>
          </div>

          <div className="p-3 bg-surface rounded-xl border border-outline-variant/20 flex items-start gap-2 text-left">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-on-surface-variant leading-relaxed">
              Your password has been securely encrypted with zero-knowledge hashing. No platform administrator has access to your password.
            </p>
          </div>

          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-primary text-on-primary rounded-xl font-medium text-xs shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Proceed to Workspace Login</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const nameError = fieldError(formik, 'admin_name');
  const passwordError = fieldError(formik, 'admin_password');
  const confirmError = fieldError(formik, 'confirm_password');
  const orgNameError = fieldError(formik, 'organization_name');
  const slugError = fieldError(formik, 'slug');
  const supportEmailError = fieldError(formik, 'support_email');
  const supportPhoneError = fieldError(formik, 'support_phone');

  // State E: Onboarding Registration Form
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-12">
      {/* Decorative ambient background glows */}
      <div
        aria-hidden="true"
        className="fixed top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none -z-10"
      />
      <div
        aria-hidden="true"
        className="fixed bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10"
      />

      <div className="max-w-xl w-full space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low border border-outline-variant/30 text-primary text-xs font-semibold shadow-xs">
            <Building2 className="w-3.5 h-3.5" />
            Workspace Setup
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
            Create Your Workspace
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant max-w-md mx-auto">
            You've been invited to launch a WhatsApp AI workspace. Set your credentials and workspace details below.
          </p>
        </div>

        {/* Verified Email Banner */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-on-surface-variant font-medium">Invited Administrator</p>
              <p className="text-xs font-semibold text-on-surface">{verifyData.email}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3" />
            Verified Invite
          </span>
        </div>

        {/* Main Onboarding Form */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 sm:p-8 shadow-xl">
          {submitError && (
            <div className="mb-6 p-3.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={formik.handleSubmit} className="space-y-6">
            {/* ---------------- Section 1: Administrator Credentials ---------------- */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
                <User className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  1. Admin Account Details
                </h3>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-on-surface-variant">
                  Your Full Name <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="admin_name"
                    value={values.admin_name}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="e.g. Sarah Jenkins"
                    className={`${inputClass} ${borderClass(!!nameError)} pl-9`}
                  />
                  <User className="w-4 h-4 text-on-surface-variant/50 absolute left-3 top-3 pointer-events-none" />
                </div>
                {nameError && <p className="text-[11px] text-error">{nameError}</p>}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-on-surface-variant">
                  Password <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="admin_password"
                    value={values.admin_password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Create a strong password"
                    className={`${inputClass} ${borderClass(!!passwordError)} pl-9 pr-10`}
                  />
                  <Lock className="w-4 h-4 text-on-surface-variant/50 absolute left-3 top-3 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-3 text-on-surface-variant/50 hover:text-on-surface cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordError && <p className="text-[11px] text-error">{passwordError}</p>}

                {/* Password Rules Visual Checklist */}
                <div className="mt-2 grid grid-cols-2 gap-1.5 bg-surface rounded-xl p-3 border border-outline-variant/30">
                  {PASSWORD_RULES.map((rule) => {
                    const pass = rule.test(values.admin_password);
                    return (
                      <div
                        key={rule.label}
                        className={`flex items-center gap-1.5 text-[10px] ${
                          pass ? 'text-primary font-medium' : 'text-on-surface-variant/70'
                        }`}
                      >
                        {pass ? <Check className="w-3 h-3 text-primary" /> : <Circle className="w-3 h-3" />}
                        <span>{rule.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-on-surface-variant">
                  Confirm Password <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="confirm_password"
                    value={values.confirm_password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    placeholder="Re-enter your password"
                    className={`${inputClass} ${borderClass(!!confirmError)} pl-9`}
                  />
                  <Lock className="w-4 h-4 text-on-surface-variant/50 absolute left-3 top-3 pointer-events-none" />
                </div>
                {confirmError && <p className="text-[11px] text-error">{confirmError}</p>}
              </div>
            </div>

            {/* ---------------- Section 2: Workspace Configuration ---------------- */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
                <Building2 className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  2. Workspace Details
                </h3>
              </div>

              {/* Workspace Name */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-on-surface-variant">
                  Workspace Name <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="organization_name"
                    value={values.organization_name}
                    onChange={handleOrgNameChange}
                    onBlur={formik.handleBlur}
                    placeholder="e.g. Acme Corporation"
                    className={`${inputClass} ${borderClass(!!orgNameError)} pl-9`}
                  />
                  <Building2 className="w-4 h-4 text-on-surface-variant/50 absolute left-3 top-3 pointer-events-none" />
                </div>
                {orgNameError && <p className="text-[11px] text-error">{orgNameError}</p>}
              </div>

              {/* Slug */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-medium text-on-surface-variant">
                    Workspace URL Identifier (Slug)
                  </label>
                  <span className="text-[10px] text-on-surface-variant/70">Unique tunnel identifier</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    name="slug"
                    value={values.slug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      formik.handleChange(e);
                    }}
                    onBlur={formik.handleBlur}
                    placeholder="e.g. acme-corp"
                    className={`${inputClass} ${borderClass(!!slugError)} pl-9`}
                  />
                  <Globe className="w-4 h-4 text-on-surface-variant/50 absolute left-3 top-3 pointer-events-none" />
                </div>
                {slugError && <p className="text-[11px] text-error">{slugError}</p>}
                <p className="text-[10px] text-on-surface-variant/80">
                  Workspace URL: <span className="font-mono text-primary font-medium">{toSlug(values.slug || values.organization_name || 'workspace')}.metarouter.ai</span>
                </p>
              </div>

              {/* Support Email & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-on-surface-variant">
                    Customer Support Email
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      name="support_email"
                      value={values.support_email}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      placeholder={verifyData.email}
                      className={`${inputClass} ${borderClass(!!supportEmailError)} pl-9`}
                    />
                    <Mail className="w-4 h-4 text-on-surface-variant/50 absolute left-3 top-3 pointer-events-none" />
                  </div>
                  {supportEmailError && <p className="text-[11px] text-error">{supportEmailError}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-on-surface-variant">
                    Support Phone (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="support_phone"
                      value={values.support_phone}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      placeholder="+1 (555) 000-0000"
                      className={`${inputClass} ${borderClass(!!supportPhoneError)} pl-9`}
                    />
                    <Phone className="w-4 h-4 text-on-surface-variant/50 absolute left-3 top-3 pointer-events-none" />
                  </div>
                  {supportPhoneError && <p className="text-[11px] text-error">{supportPhoneError}</p>}
                </div>
              </div>
            </div>

            {/* Zero Knowledge Privacy Notice */}
            <div className="p-3 bg-surface rounded-xl border border-outline-variant/30 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                <strong>Zero-Knowledge Setup:</strong> Your password is cryptographically salted & hashed on our servers. The platform super administrator will never have access to or see your password.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-primary text-on-primary rounded-xl font-medium text-xs shadow-md hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Provisioning Workspace...</span>
                </>
              ) : (
                <>
                  <span>Create Workspace & Activate Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
