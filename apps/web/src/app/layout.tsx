import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/lib/providers';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'AICS - 智能AI客服系统',
  description: '智能AI客服系统管理后台',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">
        <Providers locale={locale} messages={messages as Record<string, unknown>}>
          {children}
          <Toaster position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
