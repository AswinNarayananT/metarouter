import { useState } from 'react';
import { User, Shield, KeyRound, Save, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, Container } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAppSelector } from '@/store';
import { superAdminApi } from '@/api/superAdminApi';

export function SuperAdminSettings() {
  const user = useAppSelector((state) => state.superAdmin.user);

  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSavingProfile(true);

    try {
      await superAdminApi.patch('/api/v1/admin/profile', { name });
      setSuccessMessage('Admin profile updated successfully.');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setIsSavingPassword(true);

    try {
      await superAdminApi.post('/api/v1/admin/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccessMessage('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to update password.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <Container size="md">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface">Super Admin Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">Manage your master profile credentials and platform security.</p>
      </div>

      {(errorMessage || successMessage) && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-xs font-medium border ${
          errorMessage ? 'bg-error/10 text-error border-error/20' : 'bg-primary/10 text-primary border-primary/20'
        }`}>
          {errorMessage ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
          <span>{errorMessage || successMessage}</span>
        </div>
      )}

      <div className="grid gap-6">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <User className="size-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface">Profile Details</h2>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-outline-variant/50 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Email Address</label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-4 py-2.5 bg-surface-container/50 border border-outline-variant/30 rounded-xl text-sm text-on-surface-variant cursor-not-allowed opacity-80"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">Super admin email cannot be changed from UI.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Role Privilege</label>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                <Shield className="size-3.5" />
                <span>Super Administrator</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" disabled={isSavingProfile}>
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

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Current Password</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-surface border border-outline-variant/50 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-surface border border-outline-variant/50 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface-variant uppercase mb-1">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-surface border border-outline-variant/50 rounded-xl text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" size="sm" disabled={isSavingPassword}>
                <Lock className="size-4" />
                <span>{isSavingPassword ? 'Updating...' : 'Update Password'}</span>
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Container>
  );
}