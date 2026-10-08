import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import * as Yup from 'yup';
import { Card, Container } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppDispatch, useAppSelector } from '@/store';
import { createOrganization } from '@/store/superAdmin/organizationThunks';
import { clearOrganizationError } from '@/store/superAdmin/organizationSlice';

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

const schema = Yup.object({
  name: Yup.string().min(2, 'Organization name is required').required(),
  support_email: Yup.string().email('Enter a valid support email').required('Support email is required'),
  support_phone: Yup.string().min(6, 'Enter a valid support phone').required(),
  admin_name: Yup.string().min(2, 'Admin name is required').required(),
  admin_email: Yup.string().email('Enter a valid admin email').required('Admin email is required'),
  admin_password: Yup.string().min(8, 'Password must be at least 8 characters').required(),
});

const inputClass =
  'w-full px-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm transition-all';

export function CreateOrganizationPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isSaving, error } = useAppSelector((state) => state.organizations);
  const [validationError, setValidationError] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    support_email: '',
    support_phone: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
  });

  const previewSlug = form.slug.trim() ? toSlug(form.slug) : toSlug(form.name);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError('');
    dispatch(clearOrganizationError());

    try {
      await schema.validate(form, { abortEarly: false });
      const result = await dispatch(
        createOrganization({
          ...form,
          slug: previewSlug || undefined,
        }),
      );

      if (createOrganization.fulfilled.match(result)) {
        navigate(`/admin/organizations/${result.payload.id}`, {
          state: { adminPassword: result.payload.admin_password, justCreated: true },
        });
      }
    } catch (err: unknown) {
      if (err instanceof Yup.ValidationError) {
        setValidationError(err.errors[0]);
      }
    }
  }

  const displayError = validationError || error;

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
        {displayError && (
          <div className="mb-5 p-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="size-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Organization</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
                Organization name
              </label>
              <input
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Neurosta Labs"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
                Workspace slug
              </label>
              <input
                value={form.slug}
                onChange={(e) => update('slug', e.target.value)}
                placeholder={previewSlug || 'neurosta-labs'}
                className={inputClass + ' font-mono'}
              />
              <p className="mt-1.5 text-[11px] text-on-surface-variant">
                Login workspace: <span className="font-mono font-semibold text-primary">{previewSlug || '—'}</span>
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Support email
                </label>
                <input
                  type="email"
                  value={form.support_email}
                  onChange={(e) => update('support_email', e.target.value)}
                  placeholder="support@client.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Support phone
                </label>
                <input
                  value={form.support_phone}
                  onChange={(e) => update('support_phone', e.target.value)}
                  placeholder="+91 98765 43210"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-2 border-t border-surface-container-high">
            <div className="flex items-center gap-2 mb-1 mt-6">
              <ShieldCheck className="size-4 text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Admin user</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
                Admin full name
              </label>
              <input
                value={form.admin_name}
                onChange={(e) => update('admin_name', e.target.value)}
                placeholder="Priya Kumar"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
                Admin email
              </label>
              <input
                type="email"
                value={form.admin_email}
                onChange={(e) => update('admin_email', e.target.value)}
                placeholder="priya@client.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wider mb-1.5">
                Admin password
              </label>
              <div className="flex justify-end mb-1.5">
                <button
                  type="button"
                  className="text-[11px] font-semibold text-primary hover:underline"
                  onClick={() => {
                    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*';
                    const generated = Array.from(crypto.getRandomValues(new Uint8Array(12)))
                      .map((n) => alphabet[n % alphabet.length])
                      .join('');
                    update('admin_password', generated);
                    setPasswordVisible(true);
                  }}
                >
                  Generate password
                </button>
              </div>
              <div className="relative">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  value={form.admin_password}
                  onChange={(e) => update('admin_password', e.target.value)}
                  placeholder="Minimum 8 characters"
                  className={inputClass + ' pr-12'}
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
