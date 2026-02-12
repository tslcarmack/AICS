'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import { SUPPORTED_LOCALES, LOCALE_NAMES, type SupportedLocale } from '@aics/shared';
import { getLocale, setLocale } from '@/i18n/locale';

export function LanguageSwitcher() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const currentLocale = getLocale();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value as SupportedLocale;
    setLocale(newLocale);
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
      <select
        value={currentLocale}
        onChange={handleChange}
        disabled={isPending}
        className="flex-1 bg-transparent text-sm text-muted-foreground border-none outline-none cursor-pointer hover:text-foreground transition-colors"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_NAMES[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
