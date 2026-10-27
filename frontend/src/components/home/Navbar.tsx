import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { BrandLogo } from '@/components/ui/BrandLogo';

interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Features', href: '/#features' },
  { label: 'Architecture', href: '/#architecture' },
  { label: 'Pricing', href: '/#pricing' },
];

/** Simulated auth state */
const IS_AUTHENTICATED = false;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  // The menu remembers the page it was opened on, so moving to another page closes it
  const [mobileOpenPath, setMobileOpenPath] = useState<string | null>(null);
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 15);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const mobileOpen = mobileOpenPath === location.pathname;

  return (
    <header
      className={clsx(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-200',
        scrolled || !isHome
          ? 'bg-surface/90 backdrop-blur-md border-b border-surface-container-high shadow-xs'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-18 items-center justify-between">
          {/* Logo */}
          <BrandLogo size="md" />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Primary navigation">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="px-3.5 py-2 text-sm font-medium text-on-surface-variant rounded-lg hover:text-primary hover:bg-surface-container-low transition-colors duration-150"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Desktop Right Actions */}
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
              <span>Need assistance?</span>
              <a
                href="#support"
                className="text-primary hover:underline font-semibold"
              >
                Contact Support
              </a>
            </div>

            <div className="h-4 w-px bg-surface-container-high" />

            {IS_AUTHENTICATED ? (
              <Button variant="primary" size="sm" className="gap-1.5">
                <LayoutDashboard className="size-4" />
                Dashboard
              </Button>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link
                  to="/login"
                  className="text-sm font-medium text-on-surface-variant hover:text-primary transition-colors px-3 py-1.5"
                >
                  Sign In
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="sm">
                    Get Started Free
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
            onClick={() => setMobileOpenPath(mobileOpen ? null : location.pathname)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <div
        className={clsx(
          'md:hidden overflow-hidden transition-all duration-300 ease-in-out',
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0',
          'bg-surface-container-lowest/98 backdrop-blur-xl border-b border-surface-container-high shadow-lg',
        )}
      >
        <div className="px-5 py-4 space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="block px-3 py-2 text-sm font-medium text-on-surface-variant rounded-lg hover:text-primary hover:bg-surface-container-low transition-colors"
            >
              {item.label}
            </a>
          ))}
          <div className="pt-3 border-t border-surface-container-high space-y-2">
            <div className="flex items-center justify-between px-3 py-1 text-xs text-on-surface-variant">
              <span>Need assistance?</span>
              <a href="#support" className="text-primary font-semibold hover:underline">
                Contact Support
              </a>
            </div>
            <Link to="/login" className="block text-center py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface">
              Sign In
            </Link>
            <Link to="/register" className="block">
              <Button variant="primary" size="md" className="w-full">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
