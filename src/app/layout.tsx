import type { Metadata } from 'next';
import {
  Space_Grotesk,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
} from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { getLiveEpisode } from '@/lib/db';

const fontDisplay = Space_Grotesk({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-display',
});

const fontSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-sans',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Deck Test Tuesday | Rules of Villainy',
  description:
    'Deck Test Tuesday stream archive, match results, and decklists by Andy & Kirsten on Rules of Villainy.',
};

export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const liveEpisode = await getLiveEpisode();

  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`}
    >
      <body className="font-sans antialiased flex flex-col min-h-screen">
        <Navbar isLive={Boolean(liveEpisode)} />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
