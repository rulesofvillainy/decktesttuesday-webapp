'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Youtube } from 'lucide-react';

export function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith('/overlay') || pathname?.startsWith('/admin/controller')) {
    return null;
  }
  return (
    <footer className="bg-[#140A20] text-neutral-300 border-t-[3px] border-black mt-16 border-b-4 border-b-[#00F5D4]">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-bold">
        <div>
          <span className="text-white font-black uppercase tracking-tight">
            Deck Test Tuesday
          </span>{' '}
          • <span className="text-[#FFB703]">Rules of Villainy</span> (Andy &amp; Kirsten)
        </div>

        <div className="flex items-center gap-4">
          <Link href="/episodes" className="hover:text-[#00F5D4] transition-colors">
            Streams
          </Link>
          <Link
            href="/submit"
            className="hover:text-[#FF2E93] transition-colors"
          >
            Submit Deck
          </Link>
          <a
            href="https://www.youtube.com/@RulesOfVillainy"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-white hover:text-[#FF2E93] transition-colors"
          >
            <Youtube className="w-4 h-4 text-[#FF2E93]" />
            YouTube
          </a>
        </div>
      </div>
    </footer>
  );
}
