import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import BackgroundProgressWidget from '@/components/BackgroundProgressWidget';
import { LanguageProvider } from '@/lib/languageContext';
import { ThemeProvider } from '@/lib/themeContext';
import Script from 'next/script';

export const metadata: Metadata = {
  title: 'NovelTrans Reader - แอพอ่านนิยายแปลไทยด้วย AI',
  description: 'ดึงเนื้อหานิยายจากเว็บแปลเป็นภาษาไทยเชิงวรรณกรรมด้วย Gemini AI อ่านลื่นไหล สะดวกบนมือถือ',
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#17130f',
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('tnovel_app_theme') || 'dark';
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
            <Navbar />
            <main className="flex-1 pb-24 md:pb-12">{children}</main>
            <BackgroundProgressWidget />
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
