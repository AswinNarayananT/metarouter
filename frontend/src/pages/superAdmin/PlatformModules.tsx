import { useEffect, useState, useMemo } from 'react';
import {
  Blocks,
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  Power,
  RefreshCw,
  ShoppingBag,
  Package,
  Box,
  CreditCard,
  Bot,
  Ticket,
  Send,
  Cable,
  Users,
  Settings,
  LayoutDashboard,
  ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, Container } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { superAdminApi } from '@/api/superAdminApi';
import { getApiErrorMessage } from '@/api/errors';
import { notifyError, notifySuccess } from '@/utils/notify';
import type { PlatformModule, CreateModulePayload, UpdateModulePayload } from '@/types/moduleTypes';

// Available icons for selection
const ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: 'ShoppingBag', icon: ShoppingBag },
  { name: 'Package', icon: Package },
  { name: 'Box', icon: Box },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'Bot', icon: Bot },
  { name: 'Ticket', icon: Ticket },
  { name: 'Send', icon: Send },
  { name: 'Cable', icon: Cable },
  { name: 'Users', icon: Users },
  { name: 'Settings', icon: Settings },
  { name: 'LayoutDashboard', icon: LayoutDashboard },
];

const CATEGORIES = [
  'All',
  'Commerce',
  'Marketing',
  'Intelligence',
  'Support',
  'Administration',
  'Infrastructure',
  'Core',
  'Custom',
];

function getIconComponent(iconName: string) {
  const match = ICON_OPTIONS.find((opt) => opt.name.toLowerCase() === (iconName || '').toLowerCase());
  return match ? match.icon : Box;
}

export function PlatformModulesPage() {
  const [modules, setModules] = useState<PlatformModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<PlatformModule | null>(null);
  const [deletingModule, setDeletingModule] = useState<PlatformModule | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State for Add / Edit
  const [formData, setFormData] = useState<CreateModulePayload>({
    key: '',
    name: '',
    description: '',
    category: 'Commerce',
    icon: 'ShoppingBag',
    is_active: true,
    default_enabled: false,
  });

  // The request itself (state is only set once it answers, so the first load can run from an effect)
  const fetchModules = () =>
    superAdminApi
      .get<PlatformModule[]>('/api/v1/superadmin/modules')
      .then((res) => setModules(res.data))
      .catch((err) => setError(getApiErrorMessage(err, 'Failed to load platform modules')))
      .finally(() => setIsLoading(false));

  // Reload after a change / Refresh: show the spinner and clear the old error first
  const loadModules = () => {
    setIsLoading(true);
    setError(null);
    return fetchModules();
  };

  // First load (isLoading starts true)
  useEffect(() => {
    fetchModules();
  }, []);

  const filteredModules = useMemo(() => {
    return modules.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.key.toLowerCase().includes(search.toLowerCase()) ||
        (m.description || '').toLowerCase().includes(search.toLowerCase());

      const matchCategory =
        selectedCategory === 'All' || m.category.toLowerCase() === selectedCategory.toLowerCase();

      return matchSearch && matchCategory;
    });
  }, [modules, search, selectedCategory]);

  const handleOpenAddModal = () => {
    setFormData({
      key: '',
      name: '',
      description: '',
      category: 'Commerce',
      icon: 'ShoppingBag',
      is_active: true,
      default_enabled: false,
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (m: PlatformModule) => {
    setEditingModule(m);
    setFormData({
      key: m.key,
      name: m.name,
      description: m.description || '',
      category: m.category || 'General',
      icon: m.icon || 'Box',
      is_active: m.is_active,
      default_enabled: m.default_enabled,
    });
  };

  const handleSaveModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (editingModule) {
        // Update
        const payload: UpdateModulePayload = {
          name: formData.name,
          description: formData.description,
          category: formData.category,
          icon: formData.icon,
          is_active: formData.is_active,
          default_enabled: formData.default_enabled,
        };
        await superAdminApi.patch(`/api/v1/superadmin/modules/${editingModule.id}`, payload);
        setEditingModule(null);
        notifySuccess(`Module "${formData.name}" saved`);
      } else {
        // Create
        await superAdminApi.post('/api/v1/superadmin/modules', formData);
        setIsAddModalOpen(false);
        notifySuccess(`Module "${formData.name}" added`);
      }
      await loadModules();
    } catch (err) {
      notifyError(err, 'Failed to save module'); // The form stays open to fix and retry
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (m: PlatformModule) => {
    try {
      await superAdminApi.patch(`/api/v1/superadmin/modules/${m.id}`, {
        is_active: !m.is_active,
      });
      setModules((prev) =>
        prev.map((item) => (item.id === m.id ? { ...item, is_active: !item.is_active } : item)),
      );
      notifySuccess(`"${m.name}" ${m.is_active ? 'turned off for every workspace' : 'turned on'}`);
    } catch (err) {
      notifyError(err, 'Failed to toggle module status');
    }
  };

  const handleDeleteModule = async () => {
    if (!deletingModule) return;
    setIsSaving(true);
    try {
      await superAdminApi.delete(`/api/v1/superadmin/modules/${deletingModule.id}`);
      notifySuccess(`Module "${deletingModule.name}" deleted`);
      setDeletingModule(null);
      await loadModules();
    } catch (err) {
      notifyError(err, 'Failed to delete module');
    } finally {
      setIsSaving(false);
    }
  };

  const stats = useMemo(() => {
    const total = modules.length;
    const active = modules.filter((m) => m.is_active).length;
    const defaultEnabled = modules.filter((m) => m.default_enabled).length;
    const categoriesCount = new Set(modules.map((m) => m.category)).size;
    return { total, active, defaultEnabled, categoriesCount };
  }, [modules]);

  return (
    <Container>
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low text-primary text-xs font-semibold mb-3 border border-outline-variant/30">
            <Blocks className="size-3.5" />
            Super Admin · Extensibility
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Platform Modules</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Register new platform features, configure global availability, and manage default states for new workspaces.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadModules}
            disabled={isLoading}
            className="shrink-0"
          >
            <RefreshCw className={clsx('size-4', isLoading && 'animate-spin text-primary')} />
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenAddModal}
            className="glow-primary shrink-0"
          >
            <Plus className="size-4" />
            Add New Module
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5 border-outline-variant/30 bg-surface-container-lowest/60">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Total Modules
          </p>
          <p className="text-3xl font-extrabold text-on-surface mt-2">{stats.total}</p>
          <p className="text-[11px] text-on-surface-variant mt-1">Registered in catalog</p>
        </Card>
        <Card className="p-5 border-outline-variant/30 bg-surface-container-lowest/60">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Active Globally
          </p>
          <p className="text-3xl font-extrabold text-emerald-400 mt-2">{stats.active}</p>
          <p className="text-[11px] text-on-surface-variant mt-1">Available for activation</p>
        </Card>
        <Card className="p-5 border-outline-variant/30 bg-surface-container-lowest/60">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Default on Onboarding
          </p>
          <p className="text-3xl font-extrabold text-primary mt-2">{stats.defaultEnabled}</p>
          <p className="text-[11px] text-on-surface-variant mt-1">Enabled for new companies</p>
        </Card>
        <Card className="p-5 border-outline-variant/30 bg-surface-container-lowest/60">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            Categories
          </p>
          <p className="text-3xl font-extrabold text-on-surface mt-2">{stats.categoriesCount}</p>
          <p className="text-[11px] text-on-surface-variant mt-1">Functional domains</p>
        </Card>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="p-4 mb-6 border-outline-variant/30 bg-surface-container-lowest/80 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-on-surface-variant pointer-events-none" />
            <input
              type="text"
              placeholder="Search by module name, key, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-surface-container text-sm text-on-surface placeholder:text-on-surface-variant/60 border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition border',
                  selectedCategory === cat
                    ? 'bg-primary text-on-primary border-primary shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/20 hover:text-on-surface hover:bg-surface-container',
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-error-container/30 border border-error/30 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={loadModules}>
            Retry
          </Button>
        </div>
      )}

      {/* Modules Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6 border-outline-variant/30 animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-surface-container-high" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-32 bg-surface-container-high rounded" />
                  <div className="h-3 w-20 bg-surface-container-high rounded" />
                </div>
              </div>
              <div className="h-10 bg-surface-container-high rounded" />
            </Card>
          ))}
        </div>
      ) : filteredModules.length === 0 ? (
        <Card className="p-12 text-center border-outline-variant/30">
          <Blocks className="size-10 text-on-surface-variant mx-auto mb-3" />
          <h3 className="text-base font-semibold text-on-surface">No modules found</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            {search || selectedCategory !== 'All'
              ? 'Try modifying your search or filter selection.'
              : 'Add your first platform module by clicking the button above.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredModules.map((m) => {
            const IconComponent = getIconComponent(m.icon);
            return (
              <Card
                key={m.id}
                className={clsx(
                  'p-6 border transition-all flex flex-col justify-between group',
                  m.is_active
                    ? 'border-outline-variant/40 bg-surface-container-lowest/80 hover:border-primary/40'
                    : 'border-outline-variant/20 bg-surface-container-low/40 opacity-70',
                )}
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={clsx(
                          'size-11 rounded-xl flex items-center justify-center border shrink-0',
                          m.is_active
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'bg-surface-container text-on-surface-variant border-outline-variant/30',
                        )}
                      >
                        <IconComponent className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-on-surface group-hover:text-primary transition-colors">
                          {m.name}
                        </h3>
                        <span className="font-mono text-xs text-on-surface-variant bg-surface-container px-2 py-0.5 rounded border border-outline-variant/30">
                          {m.key}
                        </span>
                      </div>
                    </div>

                    <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/20">
                      {m.category}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-on-surface-variant line-clamp-2 mt-2 min-h-[32px]">
                    {m.description || 'No description provided.'}
                  </p>

                  {/* Badges */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-container-high">
                    {m.is_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        Active Platform-wide
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant border border-outline-variant/20">
                        <span className="size-1.5 rounded-full bg-on-surface-variant" />
                        Disabled Globally
                      </span>
                    )}

                    {m.default_enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Default
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-surface-container-high/60">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditModal(m)}
                      className="text-xs h-8 px-2.5"
                    >
                      <Edit2 className="size-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingModule(m)}
                      className="text-xs h-8 px-2 text-error hover:bg-error-container/20"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleActive(m)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition',
                      m.is_active
                        ? 'text-error border-error/30 hover:bg-error-container/20'
                        : 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10',
                    )}
                  >
                    <Power className="size-3.5" />
                    {m.is_active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {(isAddModalOpen || editingModule) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between pb-4 border-b border-surface-container-high mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <Blocks className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-on-surface">
                    {editingModule ? 'Edit Platform Module' : 'Add New Platform Module'}
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    {editingModule
                      ? `Updating module key: ${editingModule.key}`
                      : 'Define a new module key for developers and workspaces.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingModule(null);
                }}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
              >
                <X className="size-5" />
              </button>
            </div>


            <form onSubmit={handleSaveModule} className="space-y-4">
              {/* Module Key (Immutable on edit) */}
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">
                  Module Key (Identifier)
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingModule)}
                  placeholder="e.g. orders, catalog, invoicing"
                  value={formData.key}
                  onChange={(e) =>
                    setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-container text-sm font-mono text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
                />
                <p className="text-[11px] text-on-surface-variant mt-1">
                  Lowercase snake_case key used in backend guards (<code className="text-primary font-mono">require_feature('{formData.key || "key"}')</code>).
                </p>
              </div>

              {/* Display Name & Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Orders & Commerce"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-container text-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1.5">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container text-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain what this module allows workspaces to do..."
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-container text-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                />
              </div>

              {/* Icon Selector */}
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1.5">
                  Module Icon
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {ICON_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = formData.icon.toLowerCase() === opt.name.toLowerCase();
                    return (
                      <button
                        key={opt.name}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: opt.name })}
                        className={clsx(
                          'p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition',
                          isSelected
                            ? 'bg-primary text-on-primary border-primary shadow-sm'
                            : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:bg-surface-container hover:text-on-surface',
                        )}
                        title={opt.name}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Toggles */}
              <div className="pt-2 space-y-3">
                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 cursor-pointer">
                  <div>
                    <span className="text-xs font-semibold text-on-surface block">
                      Active Platform-wide
                    </span>
                    <span className="text-[11px] text-on-surface-variant block">
                      Enable module globally across MetaRouter.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="size-4 rounded text-primary focus:ring-primary"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 cursor-pointer">
                  <div>
                    <span className="text-xs font-semibold text-on-surface block">
                      Enabled by Default for New Workspaces
                    </span>
                    <span className="text-[11px] text-on-surface-variant block">
                      Newly created client companies will automatically have this module enabled.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.default_enabled}
                    onChange={(e) => setFormData({ ...formData, default_enabled: e.target.checked })}
                    className="size-4 rounded text-primary focus:ring-primary"
                  />
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-surface-container-high">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingModule(null);
                  }}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={isSaving}>
                  {isSaving ? 'Saving...' : editingModule ? 'Save Changes' : 'Create Module'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-2xl p-6">
            <div className="size-12 rounded-xl bg-error-container/30 text-error flex items-center justify-center mb-4">
              <ShieldAlert className="size-6" />
            </div>
            <h3 className="text-lg font-bold text-on-surface">Delete Module</h3>
            <p className="mt-1 text-xs text-on-surface-variant">
              Are you sure you want to delete the module <strong className="text-on-surface">{deletingModule.name}</strong> ({deletingModule.key})? This will remove it from the platform catalog.
            </p>
            <div className="flex items-center justify-end gap-2.5 mt-6">
              <Button
                variant="ghost"
                onClick={() => setDeletingModule(null)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleDeleteModule}
                disabled={isSaving}
                className="bg-error hover:bg-error/90 text-on-error"
              >
                {isSaving ? 'Deleting...' : 'Delete Module'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}
