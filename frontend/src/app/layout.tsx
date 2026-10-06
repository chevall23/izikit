import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import './globals.css';
import {
  BRAND_COLOR,
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  SITE_NAME,
  SITE_URL,
} from '@/lib/seo/site';
import { Analytics } from '@/components/seo/Analytics';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Headline font (login, signup, home and public page titles). 700/800 are
// loaded because headings use font-bold / font-extrabold — without them the
// browser synthesizes a blurry faux-bold from the 600 file.
const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

// Site-wide defaults. Public pages override title/description/canonical via
// their own `metadata` / `generateMetadata`; no canonical is set here on
// purpose (a root canonical would point every page at the home page).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'fr_FR',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
};

export const viewport: Viewport = { themeColor: BRAND_COLOR };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${sora.variable}`}>
      {/* suppressHydrationWarning: browser extensions (ColorZilla, Grammarly, …)
          inject attributes like cz-shortcut-listen onto <body> before React
          hydrates — a harmless mismatch outside our control, not a real bug. */}
      <body className={inter.className} suppressHydrationWarning>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
        <Analytics />
      </body>
    </html>
  );
}
