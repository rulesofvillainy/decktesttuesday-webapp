'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound, Lock } from 'lucide-react';

function AdminLoginForm() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next') || '/admin';
  const nextUrl =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/admin';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid master password');
        return;
      }

      window.location.assign(nextUrl);
    } catch {
      setError('Network error verifying password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="brutal-card p-6 sm:p-8 space-y-6">
        <div className="space-y-1 border-b-[2px] border-black pb-4">
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">
            DTT Admin Login
          </h1>
          <p className="text-xs font-bold text-neutral-400">
            Enter your <code className="font-mono text-[#00F5D4]">ADMIN_PASSWORD</code> to access `/admin` and `/admin/controller`.
          </p>
        </div>

        {error && (
          <div className="bg-[#D62828] text-white border-[2px] border-black p-3 text-xs font-black uppercase">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase text-neutral-300">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter ADMIN_PASSWORD..."
                className="brutal-input pl-10"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="brutal-btn w-full bg-[#00F5D4] text-black py-3 text-xs"
          >
            <Lock className="w-4 h-4" />
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={<div className="p-12 text-center font-black">Loading...</div>}
    >
      <AdminLoginForm />
    </Suspense>
  );
}
