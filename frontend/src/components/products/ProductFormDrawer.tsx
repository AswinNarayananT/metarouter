import { useEffect, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { AlertCircle, Loader2, Package, X } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { createProduct, updateProduct } from '@/store/products/productsThunks';
import { currencySymbol } from '@/utils/formatPrice';
import { Switch } from '@/components/ui/Switch';
import type { Product, ProductInput, ProductSaveError } from '@/types/productTypes';

interface FormValues {
  name: string;
  category: string;
  price: string;
  description: string;
  track_stock: boolean;
  stock_quantity: string;
  low_stock_threshold: string;
  is_active: boolean;
}

const wholeNumber = (label: string) => Yup.string().matches(/^\d{1,9}$/, `${label} must be a whole number (0 or more)`);

// Same limits as backend/app/schemas/product_schema.py
const schema = Yup.object({
  name: Yup.string().trim().required('Product name is required').max(120, 'Up to 120 characters'),
  category: Yup.string().trim().max(60, 'Up to 60 characters'),
  price: Yup.string()
    .trim()
    .required('Price is required')
    .matches(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a price like 40 or 40.50'),
  description: Yup.string().max(2000, 'Up to 2000 characters'),
  stock_quantity: Yup.string().when('track_stock', {
    is: true,
    then: () => wholeNumber('Stock').required('Stock is required'),
  }),
  low_stock_threshold: Yup.string().when('track_stock', { is: true, then: () => wholeNumber('Low-stock alert') }),
});

function toValues(product: Product | null): FormValues {
  return {
    name: product?.name ?? '',
    category: product?.category ?? '',
    price: product?.price ?? '',
    description: product?.description ?? '',
    track_stock: product?.track_stock ?? true,
    stock_quantity: String(product?.stock_quantity ?? 0),
    low_stock_threshold: product?.low_stock_threshold == null ? '' : String(product.low_stock_threshold),
    is_active: product?.is_active ?? true,
  };
}

// With stock tracking off, the stock fields aren't sent, so the saved count and alert are kept for later
function toInput(values: FormValues): ProductInput {
  return {
    name: values.name.trim(),
    category: values.category.trim() || null,
    price: values.price.trim(),
    description: values.description.trim() || null,
    track_stock: values.track_stock,
    ...(values.track_stock && {
      stock_quantity: Number(values.stock_quantity),
      low_stock_threshold: values.low_stock_threshold === '' ? null : Number(values.low_stock_threshold),
    }),
    is_active: values.is_active,
  };
}

const inputClass = 'w-full px-3.5 py-2.5 bg-surface border rounded-xl text-sm text-on-surface focus:outline-none transition-colors';
const borderClass = (hasError: boolean) => (hasError ? 'border-error focus:border-error' : 'border-outline/30 focus:border-primary');

// Mounted only while open (keyed by product), so each opening starts with a fresh form
export function ProductFormDrawer({
  product,
  categories,
  currency,
  onClose,
  onSaved,
}: {
  product: Product | null; // null = add a new product
  categories: string[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useFormik<FormValues>({
    initialValues: toValues(product),
    validationSchema: schema,
    onSubmit: async (values, helpers) => {
      setFormError(null);
      const input = toInput(values);

      // Editing sends only what changed
      let result;
      if (product) {
        const before = toInput(toValues(product));
        const changes = Object.fromEntries(Object.entries(input).filter(([key, value]) => before[key as keyof ProductInput] !== value));
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        result = await dispatch(updateProduct({ id: product.id, ...changes }));
      } else {
        result = await dispatch(createProduct(input));
      }

      if (result.meta.requestStatus === 'fulfilled') {
        onSaved();
        return;
      }
      const error = result.payload as ProductSaveError;
      if (error?.field === 'name') helpers.setFieldError('name', error.message);
      else setFormError(error?.message ?? 'Failed to save the product');
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !form.isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form.isSubmitting, onClose]);

  const error = (field: keyof FormValues) => (form.touched[field] || form.submitCount > 0 ? (form.errors[field] as string | undefined) : undefined);
  const symbol = currencySymbol(currency);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={product ? 'Edit product' : 'Add product'}>
      <div className="absolute inset-0 bg-black/40" onClick={() => !form.isSubmitting && onClose()} aria-hidden="true" />

      <aside className="relative w-full sm:w-110 h-full flex flex-col bg-surface border-l border-outline-variant/40 shadow-2xl">
        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-outline-variant/30 bg-surface-container-low">
          <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-on-surface">{product ? 'Edit product' : 'Add product'}</h2>
            <p className="text-xs text-on-surface-variant truncate">{product ? product.name : 'Add it to your catalog.'}</p>
          </div>
          <button type="button" onClick={onClose} disabled={form.isSubmitting} aria-label="Close" className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={form.handleSubmit} noValidate className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {formError && (
              <p role="alert" className="flex items-start gap-2 px-3 py-2 rounded-xl bg-error-container/20 border border-error/30 text-xs text-error">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" /> {formError}
              </p>
            )}

            <FormField label="Name" htmlFor="product_name" error={error('name')}>
              <input id="product_name" type="text" maxLength={120} autoFocus {...form.getFieldProps('name')} aria-invalid={!!error('name')} className={`${inputClass} ${borderClass(!!error('name'))}`} />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Price" htmlFor="product_price" error={error('price')}>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant pointer-events-none">{symbol}</span>
                  <input
                    id="product_price"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...form.getFieldProps('price')}
                    aria-invalid={!!error('price')}
                    className={`${inputClass} ${borderClass(!!error('price'))}`}
                    style={{ paddingLeft: `${1.5 + symbol.length * 0.55}rem` }}
                  />
                </div>
              </FormField>
              <FormField label="Category" htmlFor="product_category" hint="Optional" error={error('category')}>
                <input id="product_category" type="text" list="product_categories" maxLength={60} placeholder="e.g. Beverages" {...form.getFieldProps('category')} className={`${inputClass} ${borderClass(!!error('category'))}`} />
                <datalist id="product_categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </FormField>
            </div>

            <FormField label="Description" htmlFor="product_description" hint="Optional. The AI can use it to answer questions later." error={error('description')}>
              <textarea id="product_description" rows={3} maxLength={2000} {...form.getFieldProps('description')} className={`${inputClass} ${borderClass(!!error('description'))} resize-y`} />
            </FormField>

            {/* Stock */}
            <div className="rounded-xl border border-outline-variant/40 p-4 space-y-4">
              <Toggle
                label="Track stock"
                hint="Turn off for services or made-to-order items."
                checked={form.values.track_stock}
                onChange={(v) => form.setFieldValue('track_stock', v)}
              />
              {form.values.track_stock && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="In stock" htmlFor="product_stock" error={error('stock_quantity')}>
                    <input id="product_stock" type="text" inputMode="numeric" {...form.getFieldProps('stock_quantity')} aria-invalid={!!error('stock_quantity')} className={`${inputClass} ${borderClass(!!error('stock_quantity'))}`} />
                  </FormField>
                  <FormField label="Low-stock alert at" htmlFor="product_threshold" hint="Optional" error={error('low_stock_threshold')}>
                    <input id="product_threshold" type="text" inputMode="numeric" placeholder="e.g. 5" {...form.getFieldProps('low_stock_threshold')} aria-invalid={!!error('low_stock_threshold')} className={`${inputClass} ${borderClass(!!error('low_stock_threshold'))}`} />
                  </FormField>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-outline-variant/40 p-4">
              <Toggle
                label="For sale"
                hint="Turn off to hide it for now without archiving it."
                checked={form.values.is_active}
                onChange={(v) => form.setFieldValue('is_active', v)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex justify-end gap-2 px-5 py-4 border-t border-outline-variant/30">
            <button type="button" onClick={onClose} disabled={form.isSubmitting} className="px-4 py-2 rounded-xl text-sm text-on-surface hover:bg-surface-container cursor-pointer">
              Cancel
            </button>
            <button
              type="submit"
              disabled={form.isSubmitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {form.isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {product ? 'Save changes' : 'Add product'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function FormField({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium text-on-surface">
        {label}
        {hint && <span className="text-xs font-normal text-on-surface-variant">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-on-surface">{label}</p>
        <p className="text-xs text-on-surface-variant">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
