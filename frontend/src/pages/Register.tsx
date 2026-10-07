import { AuthHeader } from '@/components/auth/AuthHeader';
import { AuthFooter } from '@/components/auth/AuthFooter';
import { WorkspaceRegisterForm } from '@/components/auth/WorkspaceRegisterForm';

export function Register() {
  return (
    <div className="bg-surface font-body text-on-surface antialiased min-h-screen flex flex-col justify-between">
      <AuthHeader />

      <main className="w-full flex-1 flex items-center justify-center px-4 py-8">
        <div className="flex flex-col w-full items-center justify-center py-4">
          <div className="relative w-full max-w-xl mx-auto">
            {/* Subtle Ambient Glow */}
            <div
              aria-hidden="true"
              className="absolute -top-12 -left-12 w-72 h-72 bg-primary-fixed/30 rounded-full blur-3xl pointer-events-none"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-16 -right-12 w-80 h-80 bg-surface-container-highest/60 rounded-full blur-3xl pointer-events-none"
            />

            {/* Main Registration Card */}
            <WorkspaceRegisterForm />
          </div>
        </div>
      </main>

      <AuthFooter />
    </div>
  );
}
