import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import BackgroundProgressWidget from '@/components/BackgroundProgressWidget';
import AccessDeniedModal from '@/components/AccessDeniedModal';
import { LanguageProvider } from '@/lib/languageContext';
import { ThemeProvider } from '@/lib/themeContext';
import { AuthProvider } from '@/lib/authContext';
import Script from 'next/script';
import { languages } from '@/lib/languages';

export const metadata: Metadata = {
  title: `${languages.th.appTitle} - ${languages.th.appDesc}`,
  description: `${languages.th.appTitle} - ${languages.th.heroDesc}`,
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#fffdf7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700&family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Cinzel:wght@500;600;700&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('tnovel_app_theme') || 'light';
                  var doc = document.documentElement;
                  doc.classList.remove('dark', 'light', 'sepia', 'theme-dark', 'theme-light', 'theme-sepia');
                  doc.classList.add(saved);
                  doc.classList.add('theme-' + saved);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="flex flex-col min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-amber-500/20">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <Navbar />
              <main className="flex-1 pb-24 md:pb-12">{children}</main>
              <BackgroundProgressWidget />
              <AccessDeniedModal />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>

        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(
                  function(registration) {
                    console.log('PWA ServiceWorker registered with scope: ', registration.scope);
                  },
                  function(err) {
                    console.log('PWA ServiceWorker registration failed: ', err);
                  }
                );
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
