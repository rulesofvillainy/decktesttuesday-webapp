import React from 'react';
import { redirect } from 'next/navigation';
import { isAdminAuthenticated } from '@/lib/auth';
import {
  getAllDecks,
  getEnrichedEpisodes,
  getRetentionStats,
  getSubmissions,
} from '@/lib/db';
import { AdminDashboardClient } from '@/components/AdminDashboardClient';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const authenticated = await isAdminAuthenticated();
  if (!authenticated) {
    redirect('/admin/login?next=/admin');
  }

  const [episodes, submissions, retention, decks] = await Promise.all([
    getEnrichedEpisodes({ includeHidden: true }),
    getSubmissions('All'),
    getRetentionStats(90),
    getAllDecks(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminDashboardClient
        initialEpisodes={episodes}
        initialSubmissions={submissions}
        initialRetention={retention}
        initialDecks={decks}
      />
    </div>
  );
}
