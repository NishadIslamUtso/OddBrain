import type { Metadata } from 'next';
import './globals.css';
import Footer from '@/components/Footer';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'CosmoCode - Earth Analog Finder',
  description:
    'Ranks 24 real Earth sites by how closely they match the conditions of a permanent Moon base or Mars base, and shows all of the math.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <div className="flex min-h-screen flex-col">
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
