import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { loginWorkspaceUser } from '@/store/workspace/workspaceThunks';
import { clearWorkspaceError } from '@/store/workspace/workspaceSlice';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isLoading, error } = useAppSelector((state) => state.workspace);

  useEffect(() => {
    // Extract subdomain tunnel (e.g. 'acme' from 'acme.metarouter.ai')
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length > 1 && parts[0] !== 'www' && parts[0] !== 'admin') {
      setOrgSlug(parts[0]);
    }
    dispatch(clearWorkspaceError());
  }, [dispatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resultAction = await dispatch(
      loginWorkspaceUser({ email, password, org_slug: orgSlug || 'default' })
    );

    if (loginWorkspaceUser.fulfilled.match(resultAction)) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-8 shadow-xl relative z-10">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-on-surface">Sign in to your workspace</h2>
        <p className="text-sm text-on-surface-variant mt-1">Enter your organization credentials below</p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-error-container text-on-error-container text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 w-4 h-4 text-on-surface-variant/60" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 w-4 h-4 text-on-surface-variant/60" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-outline/30 rounded-xl text-sm text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-primary text-on-primary font-medium rounded-xl hover:bg-primary/90 transition-all shadow-md disabled:opacity-50"
        >
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}