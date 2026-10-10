import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Shield, Lock, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { verifyInvitationToken, acceptWorkspaceInvitation } from '@/store/workspace/workspaceThunks';

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

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // 1. Verify token on initial load
  useEffect(() => {
    if (token) {
      dispatch(verifyInvitationToken(token));
    }
  }, [token, dispatch]);

  // Sync pre-filled name from backend verification payload
  useEffect(() => {
    if (verifiedInvite?.name) {
      setName(verifiedInvite.name);
    }
  }, [verifiedInvite]);

  // 2. Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (token) {
      dispatch(acceptWorkspaceInvitation({ token, name, password }));
    }
  };

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

        {(error || passwordError) && (
          <div className="flex items-center gap-2 p-3 bg-error/10 text-error rounded-xl text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{passwordError || error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface mb-1">Email Address</label>
            <input
              type="email"
              disabled
              value={verifiedInvite?.email || ''}
              className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-container text-on-surface-variant text-xs cursor-not-allowed opacity-80"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface mb-1">Your Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full Name"
              className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/50 bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface mb-1">Create Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/50 bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface mb-1">Confirm Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/50 bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
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