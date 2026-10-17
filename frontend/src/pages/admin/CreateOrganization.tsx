import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Card, Container } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { createOrganization } from '@/store/superAdmin/organizationThunks';
import { clearOrganizationError } from '@/store/superAdmin/organizationSlice';
import { emailField, fieldError, nameField } from '@/validation/schemas';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

interface CreateOrganizationValues {
  name: string;
  slug: string;
  support_email: string;
  support_phone: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
}

// Mirrors the backend OrganizationCreateRequest constraints
const schema = Yup.object({
  name: nameField('Organization name'),
  slug: Yup.string()
    .trim()
    .test('slug-length', 'Slug must be between 2 and 80 characters', (value) => {
      if (!value) return true; // optional — derived from the name when empty
      const slug = toSlug(value);
      return slug.length >= 2 && slug.length <= 80;
    }),
  support_email: emailField('Support email'),
  support_phone: Yup.string()
    .trim()
    .required('Support phone is required')
    .matches(/^\+?[\d\s()-]+$/, 'Phone can only contain digits, spaces, +, - and ()')
    .min(6, 'Phone must be at least 6 characters')
    .max(32, 'Phone must be 32 characters or less'),
  admin_name: nameField('Admin name'),
  admin_email: emailField('Admin email'),
  admin_password: Yup.string()
    .required('Admin password is required')
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or less'),
});

const inputClass =
  'w-full px-4 py-2.5 bg-surface border rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 text-sm transition-all';

function borderClass(hasError: boolean) {
  return hasError
    ? 'border-error focus:border-error focus:ring-error'
    : 'border-outline/30 focus:border-primary focus:ring-primary';
}

const labelClass = 'block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5';

function FieldMessage({ error }: { error?: string }) {
  return error ? <p className="mt-1 text-xs text-error">{error}</p> : null;
}

export function CreateOrganizationPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isSaving, error } = useAppSelector((state) => state.organizations);
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    dispatch(clearOrganizationError());
  }, [dispatch]);

  const formik = useFormik<CreateOrganizationValues>({
    initialValues: {
      name: '',
      slug: '',
      support_email: '',
      support_phone: '',
      admin_name: '',
      admin_email: '',
      admin_password: '',
    },
    validationSchema: schema,
    onSubmit: async (values) => {
      dispatch(clearOrganizationError());
      const slug = values.slug.trim() ? toSlug(values.slug) : toSlug(values.name);
      const result = await dispatch(
        createOrganization({
          name: values.name.trim(),
          slug: slug || undefined,
          support_email: values.support_email.trim(),
          support_phone: values.support_phone.trim(),
          admin_name: values.admin_name.trim(),
          admin_email: values.admin_email.trim(),
          admin_password: values.admin_password,
        }),
      );

      if (createOrganization.fulfilled.match(result)) {
        navigate(`/admin/organizations/${result.payload.id}`, {
          state: { adminPassword: result.payload.admin_password, justCreated: true },
        });
      }
    },
  });

  const { values } = formik;
  const previewSlug = values.slug.trim() ? toSlug(values.slug) : toSlug(values.name);
  const err = (name: keyof CreateOrganizationValues) => fieldError(formik, name);

  const generatePassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
    const generated = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((n) => alphabet[n % alphabet.length])
      .join('');
    formik.setFieldValue('admin_password', generated);
    formik.setFieldTouched('admin_password', true, false);
    setPasswordVisible(true);
  };

  return (
    <Container size="md">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-4 border border-outline-variant/30">
          <Building2 className="size-3.5" />
          New tenant
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Create organization</h1>
        <p className="mt-2 text-on-surface-variant">
          Provision a workspace and the first admin user. You will be able to copy credentials on the next screen.
        </p>
      </div>

      <Card variant="form" className="p-6 sm:p-8">
        {error && (
          <div className="mb-5 p-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={formik.handleSubmit} noValidate className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="size-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Organization</h2>
            </div>
            <div>
              <label htmlFor="name" className={labelClass}>Organization name</label>
              <input
                id="name"
                placeholder="Neurosta Labs"
                aria-invalid={!!err('name')}
                {...formik.getFieldProps('name')}
                className={`${inputClass} ${borderClass(!!err('name'))}`}
              />
              <FieldMessage error={err('name')} />
            </div>
            <div>
              <label htmlFor="slug" className={labelClass}>Workspace slug</label>
              <input
                id="slug"
                placeholder={previewSlug || 'neurosta-labs'}
                aria-invalid={!!err('slug')}
                {...formik.getFieldProps('slug')}
                className={`${inputClass} ${borderClass(!!err('slug'))} font-mono`}
              />
              {err('slug') ? (
                <FieldMessage error={err('slug')} />
              ) : (
                <p className="mt-1.5 text-[11px] text-on-surface-variant">
                  Login workspace: <span className="font-mono font-semibold text-primary">{previewSlug || '—'}</span>
                </p>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="support_email" className={labelClass}>Support email</label>
                <input
                  id="support_email"
                  type="email"
                  placeholder="support@client.com"
                  aria-invalid={!!err('support_email')}
                  {...formik.getFieldProps('support_email')}
                  className={`${inputClass} ${borderClass(!!err('support_email'))}`}
                />
                <FieldMessage error={err('support_email')} />
              </div>
              <div>
                <label htmlFor="support_phone" className={labelClass}>Support phone</label>
                <input
                  id="support_phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  aria-invalid={!!err('support_phone')}
                  {...formik.getFieldProps('support_phone')}
                  className={`${inputClass} ${borderClass(!!err('support_phone'))}`}
                />
                <FieldMessage error={err('support_phone')} />
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-2 border-t border-surface-container-high">
            <div className="flex items-center gap-2 mb-1 mt-6">
              <ShieldCheck className="size-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Admin user</h2>
            </div>
            <div>
              <label htmlFor="admin_name" className={labelClass}>Admin full name</label>
              <input
                id="admin_name"
                placeholder="Priya Kumar"
                aria-invalid={!!err('admin_name')}
                {...formik.getFieldProps('admin_name')}
                className={`${inputClass} ${borderClass(!!err('admin_name'))}`}
              />
              <FieldMessage error={err('admin_name')} />
            </div>
            <div>
              <label htmlFor="admin_email" className={labelClass}>Admin email</label>
              <input
                id="admin_email"
                type="email"
                placeholder="priya@client.com"
                aria-invalid={!!err('admin_email')}
                {...formik.getFieldProps('admin_email')}
                className={`${inputClass} ${borderClass(!!err('admin_email'))}`}
              />
              <FieldMessage error={err('admin_email')} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="admin_password" className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  Admin password
                </label>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-primary hover:underline"
                  onClick={generatePassword}
                >
                  Generate password
                </button>
              </div>
              <div className="relative">
                <input
                  id="admin_password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Minimum 8 characters"
                  aria-invalid={!!err('admin_password')}
                  {...formik.getFieldProps('admin_password')}
                  className={`${inputClass} ${borderClass(!!err('admin_password'))} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((v) => !v)}
                  className="absolute inset-y-0 right-0 px-3 text-on-surface-variant hover:text-on-surface"
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                >
                  {passwordVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <FieldMessage error={err('admin_password')} />
            </div>
          </section>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button type="submit" variant="primary" loading={isSaving} className="glow-primary flex-1">
              Create organization
            </Button>
            <Link to="/admin/organizations" className="sm:w-auto">
              <Button type="button" variant="secondary" className="w-full">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </Container>
  );
}
