'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Plug,
  BookOpen,
  Target,
  Bot,
  Shield,
  Ticket,
  Settings,
  Braces,
  Wrench,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { LanguageSwitcher } from '@/components/language-switcher';

const navItems = [
  { href: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
  { href: '/integrations', labelKey: 'emailAccounts', icon: Plug },
  { href: '/knowledge', labelKey: 'knowledge', icon: BookOpen },
  { href: '/intents', labelKey: 'intents', icon: Target },
  { href: '/variables', labelKey: 'variables', icon: Braces },
  { href: '/tools', labelKey: 'tools', icon: Wrench },
  { href: '/agents', labelKey: 'agents', icon: Bot },
  { href: '/safety', labelKey: 'safety', icon: Shield },
  { href: '/tickets', labelKey: 'tickets', icon: Ticket },
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        <div className="p-4">
          <Link href="/dashboard" className="text-xl font-bold text-primary">
            AICS
          </Link>
          <p className="text-xs text-muted-foreground mt-1">{t('appSubtitle')}</p>
        </div>
        <nav className="space-y-1 px-2 flex-1">
          {navItems.map(({ href, labelKey, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border">
          <LanguageSwitcher />
          <div className="px-2 pb-2">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t('logout')}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-muted/30">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
