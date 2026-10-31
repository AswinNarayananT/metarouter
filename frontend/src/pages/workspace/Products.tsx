import { useEffect, useState } from 'react';
import { AlertTriangle, Archive, Loader2, Minus, Package, PackageX, Pencil, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { adjustStock, archiveProduct, fetchProductCategories, fetchProducts, restoreProduct, updateProduct } from '@/store/products/productsThunks';
import { ProductFormDrawer } from '@/components/products/ProductFormDrawer';
import { StockBadge } from '@/components/products/StockBadge';
import { Switch } from '@/components/ui/Switch';
import { formatPrice } from '@/utils/formatPrice';
import { notifyError } from '@/utils/notify';
import type { Product, ProductSaveError, ProductStatusFilter, ProductsPage, StockStatus } from '@/types/productTypes';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 300;
const SUPERVISOR_ROLES = ['admin', 'manager'];

// Same rules as stock_status in backend/app/services/product_service.py, for the row shown before the server answers
function stockStatus(product: Product, quantity: number): StockStatus {
  if (!product.track_stock) return 'not_tracked';
  if (quantity <= 0) return 'out';
  if (product.low_stock_threshold !== null && quantity <= product.low_stock_threshold) return 'low';
  return 'in_stock';
}

const STATUS_TABS:{ value: ProductStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'archived', label: 'Archived' },
];

export function Products() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.workspace.user);
  const orgCurrency = useAppSelector((state) => state.workspace.organization?.currency);
  const canEdit = SUPERVISOR_ROLES.includes(user?.role ?? '');

  // The page the server returned, tagged with the request it answers (loading = the tag doesn't match yet)
  const [status, setStatus] = useState<ProductStatusFilter>('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState(''); // The search, sent once typing pauses
  const [page, setPage] = useState(1);
  const [reloads, setReloads] = useState(0); // Bumped after a save, archive or restore
  const [result, setResult] = useState<{ key: string; data: ProductsPage | null; error: string | null } | null>(null);
  const requestKey = `${status}|${category}|${query}|${page}|${reloads}`;
  const isLoading = result?.key !== requestKey;
  const data = result?.data ?? null;

  const [categories, setCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null); // Archive / restore / For sale in progress

  // 1. Search on the server once typing pauses, from the first page
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // 2. Load the page; an emptied last page (after an archive) steps back one. An answer to an older request is dropped
  useEffect(() => {
    let stale = false;
    const key = `${status}|${category}|${query}|${page}|${reloads}`;
    dispatch(fetchProducts({ status, category: category || undefined, q: query || undefined, page, page_size: PAGE_SIZE })).then((res) => {
      if (stale) return;
      if (!fetchProducts.fulfilled.match(res)) {
        setResult({ key, data: null, error: (res.payload as string) ?? "Couldn't load products" });
        return;
      }
      if (res.payload.products.length === 0 && page > 1) setPage(page - 1);
      setResult({ key, data: res.payload, error: null });
    });
    return () => {
      stale = true;
    };
  }, [dispatch, status, category, query, page, reloads]);

  // 3. Categories for the filter and the form's suggestions
  useEffect(() => {
    dispatch(fetchProductCategories()).then((res) => {
      if (fetchProductCategories.fulfilled.match(res)) setCategories(res.payload);
    });
  }, [dispatch, reloads]);

  const reload = () => setReloads((n) => n + 1);

  const switchStatus = (next: ProductStatusFilter) => {
    setStatus(next);
    setPage(1);
  };

  // Puts one product into the shown page without refetching
  const replaceProduct = (product: Product) =>
    setResult((prev) => (prev?.data ? { ...prev, data: { ...prev.data, products: prev.data.products.map((p) => (p.id === product.id ? product : p)) } } : prev));

  // ±1 shows at once, then the server's number; a failure (toasted) reloads, since the real count may differ from what was shown
  const changeStock = async (product: Product, change: number) => {
    replaceProduct({ ...product, stock_quantity: product.stock_quantity + change, stock_status: stockStatus(product, product.stock_quantity + change) });
    const res = await dispatch(adjustStock({ id: product.id, change }));
    if (adjustStock.fulfilled.match(res)) {
      replaceProduct(res.payload);
      // The header counts may have changed (low / out)
      if (res.payload.stock_status !== product.stock_status) reload();
    } else reload();
  };

  const toggleForSale = async (product: Product) => {
    setBusyId(product.id);
    const res = await dispatch(updateProduct({ id: product.id, is_active: !product.is_active }));
    setBusyId(null);
    if (updateProduct.fulfilled.match(res)) replaceProduct(res.payload);
    else notifyError((res.payload as ProductSaveError)?.message);
  };

  const toggleArchived = async (product: Product) => {
    setBusyId(product.id);
    const res = await dispatch(product.archived ? restoreProduct(product.id) : archiveProduct(product.id));
    setBusyId(null);
    if (res.meta.requestStatus === 'fulfilled') reload();
  };

  const handleSaved = () => {
    setEditing(null);
    reload();
  };

  const currency = data?.currency ?? orgCurrency ?? 'INR';
  const products = data?.products ?? [];
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const filtered = Boolean(query || category || status !== 'all');
  const catalogEmpty = summary?.total === 0 && status !== 'archived';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">Products</h1>
          <p className="text-sm text-on-surface-variant">Your catalog, prices and stock.</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add product
          </button>
        )}
      </div>

      {/* Header counts; clicking one filters the list */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={Package} label="Products" value={summary?.total} active={status === 'all'} onClick={() => switchStatus('all')} />
        <SummaryCard icon={AlertTriangle} label="Low stock" value={summary?.low} tone="amber" active={status === 'low'} onClick={() => switchStatus('low')} />
        <SummaryCard icon={PackageX} label="Out of stock" value={summary?.out} tone="error" active={status === 'out'} onClick={() => switchStatus('out')} />
      </div>

      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-sm overflow-hidden">
        {/* Toolbar: status tabs, category and search */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant/30">
          <div className="flex flex-wrap items-center gap-1" role="tablist">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={status === t.value}
                onClick={() => switchStatus(t.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  status === t.value ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {categories.length > 0 && (
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter by category"
                className="px-3 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary cursor-pointer"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <div className="relative flex-1 sm:w-64">
              {isLoading && search.trim() === query && query ? (
                <Loader2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant animate-spin" />
              ) : (
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
              )}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
                placeholder="Search products"
                aria-label="Search products"
                maxLength={100}
                className="w-full pl-9 pr-9 py-2 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-on-surface-variant hover:bg-surface-container cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {result?.error && !isLoading ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-error">{result.error}</p>
            <button type="button" onClick={reload} className="text-xs font-medium text-primary hover:underline cursor-pointer">
              Try again
            </button>
          </div>
        ) : isLoading && !data ? (
          <ul className="divide-y divide-outline-variant/30" aria-label="Loading products">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-3.5 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-surface-container" />
                  <div className="h-3 w-24 rounded bg-surface-container" />
                </div>
                <div className="h-3 w-16 rounded bg-surface-container" />
                <div className="h-6 w-24 rounded-full bg-surface-container" />
              </li>
            ))}
          </ul>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <Package className="w-6 h-6 text-on-surface-variant/60" />
            <p className="text-sm text-on-surface-variant">
              {catalogEmpty && !query && !category ? 'No products yet.' : status === 'archived' && !filtered ? 'No archived products.' : 'No products match your filters.'}
            </p>
            {catalogEmpty && !query && !category && canEdit && (
              <button type="button" onClick={() => setEditing('new')} className="text-sm font-medium text-primary hover:underline cursor-pointer">
                Add your first product
              </button>
            )}
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-on-surface-variant border-b border-outline-variant/30">
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium text-right">Price</th>
                  <th className="px-4 py-2.5 font-medium">Stock</th>
                  {canEdit && status !== 'archived' && <th className="px-4 py-2.5 font-medium">Adjust</th>}
                  <th className="px-4 py-2.5 font-medium">For sale</th>
                  {canEdit && <th className="px-4 py-2.5" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-surface-container/40 transition-colors">
                    <td className="px-4 py-3 min-w-48">
                      <p className={`font-medium ${product.archived || !product.is_active ? 'text-on-surface-variant' : 'text-on-surface'}`}>{product.name}</p>
                      {product.category && <p className="text-xs text-on-surface-variant">{product.category}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-on-surface">{formatPrice(product.price, currency)}</td>
                    <td className="px-4 py-3">
                      <StockBadge product={product} />
                    </td>
                    {canEdit && status !== 'archived' && (
                      <td className="px-4 py-3">
                        {product.track_stock && (
                          <div className="flex items-center gap-1">
                            <StockButton label={`Remove one ${product.name}`} disabled={product.stock_quantity <= 0} onClick={() => changeStock(product, -1)}>
                              <Minus className="w-3.5 h-3.5" />
                            </StockButton>
                            <StockButton label={`Add one ${product.name}`} onClick={() => changeStock(product, 1)}>
                              <Plus className="w-3.5 h-3.5" />
                            </StockButton>
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <Switch
                        checked={product.is_active}
                        onChange={() => toggleForSale(product)}
                        label={`${product.name} for sale`}
                        disabled={!canEdit || product.archived || busyId === product.id}
                      />
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!product.archived && (
                            <IconButton label={`Edit ${product.name}`} onClick={() => setEditing(product)}>
                              <Pencil className="w-4 h-4" />
                            </IconButton>
                          )}
                          <IconButton
                            label={product.archived ? `Restore ${product.name}` : `Archive ${product.name}`}
                            onClick={() => toggleArchived(product)}
                            disabled={busyId === product.id}
                          >
                            {busyId === product.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : product.archived ? (
                              <RotateCcw className="w-4 h-4" />
                            ) : (
                              <Archive className="w-4 h-4" />
                            )}
                          </IconButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-outline-variant/30">
            <p className="text-xs text-on-surface-variant">
              Showing {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1 || isLoading}
                className="px-3 py-1 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-xs text-on-surface-variant">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || isLoading}
                className="px-3 py-1 rounded-lg text-xs font-medium border border-outline-variant/30 text-on-surface disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/5 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {editing !== null && (
        <ProductFormDrawer
          key={editing === 'new' ? 'new' : editing.id}
          product={editing === 'new' ? null : editing}
          categories={categories}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

const TONES = {
  primary: 'bg-primary/10 text-primary',
  amber: 'bg-amber-500/10 text-amber-700',
  error: 'bg-error/10 text-error',
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = 'primary',
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value?: number;
  tone?: keyof typeof TONES;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-colors cursor-pointer ${
        active ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container/60'
      }`}
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone]}`}>
        <Icon className="w-5 h-5" />
      </span>
      <span>
        <span className="block text-2xl font-bold text-on-surface tabular-nums">{value ?? '–'}</span>
        <span className="block text-xs text-on-surface-variant">{label}</span>
      </span>
    </button>
  );
}

function StockButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-7 h-7 flex items-center justify-center rounded-lg border border-outline-variant/40 text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      {children}
    </button>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface disabled:opacity-50 cursor-pointer"
    >
      {children}
    </button>
  );
}
