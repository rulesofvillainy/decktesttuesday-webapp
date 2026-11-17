'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Library, Menu, Send, X } from 'lucide-react';

interface NavbarProps {
  isLive?: boolean;
}

export function Navbar({ isLive = false }: NavbarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (pathname?.startsWith('/overlay') || pathname?.startsWith('/admin/controller')) {
    return null;
  }

  const navItems = [
    { href: '/episodes', label: 'DTT Streams', icon: Library },
    { href: '/submit', label: 'Submit a Deck', icon: Send },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#1C0F2F] text-[#F4F4F6] border-b-[3px] border-black shadow-[0_4px_0_#000000] border-t-[3px] border-t-[#FF2E93]">
      <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex items-center gap-3 focus:outline-none"
        >
          <div className="w-10 h-10 bg-[#FF2E93] border-[3px] border-black shadow-[3px_3px_0px_#000000] flex items-center justify-center font-black text-lg text-white tracking-tighter group-hover:bg-[#FF4B91] transition-colors">
            DTT
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-black text-lg sm:text-xl uppercase tracking-tight text-white group-hover:text-[#00F5D4] transition-colors">
              Deck Test Tuesday
            </span>
            {isLive && (
              <span className="bg-[#FF2E93] text-white text-[11px] font-black uppercase px-2 py-0.5 border-[2px] border-black animate-pulse">
                LIVE
              </span>
            )}
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`brutal-btn px-4 py-2 text-xs ${
                  active
                    ? 'bg-[#00F5D4] text-black shadow-[3px_3px_0px_#000000]'
                    : item.href === '/submit'
                      ? 'bg-[#FF2E93] text-white hover:bg-[#FF4B91]'
                      : 'bg-[#2E184A] text-white hover:bg-[#3B1F54] hover:text-[#00F5D4]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="md:hidden brutal-btn bg-[#2E184A] text-white p-2"
          aria-label="Toggle Menu"
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#1C0F2F] border-t-[3px] border-black px-4 py-3 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`brutal-btn w-full justify-start px-4 py-2.5 text-xs ${
                  active
                    ? 'bg-[#00F5D4] text-black'
                    : 'bg-[#2E184A] text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
