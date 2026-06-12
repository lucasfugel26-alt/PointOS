import type { Metadata, Viewport } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import AppInit from '@/components/AppInit';

export const metadata: Metadata = {
  title: 'PointOS – Kasse & Lager',
  description: 'Offline-fähiges Kassensystem für Festivals & Veranstaltungen',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PointOS',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f1117',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="font-sans">
        <AppInit />
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-content pb-16 md:pb-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
