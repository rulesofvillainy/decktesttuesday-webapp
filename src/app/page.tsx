import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Flame,
  Layers,
  Library,
  Send,
  Sparkles,
  Tv,
} from 'lucide-react';
import { getFeaturedEpisode, getEnrichedEpisodes } from '@/lib/db';
import { LiveStreamHero } from '@/components/LiveStreamHero';
import { InkPairBadges } from '@/components/InkBadge';
import { formatPlayedBy } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [featuredResult, allEpisodes] = await Promise.all([
    getFeaturedEpisode(),
    getEnrichedEpisodes({ includeHidden: false }),
  ]);

  const recentEpisodes = allEpisodes.slice(0, 4);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-10">
      {/* Top Preview Card: Latest, Live, or Upcoming Stream */}
      <LiveStreamHero
        episode={featuredResult.episode}
        status={featuredResult.status}
      />

      {/* Main Site Functions / Features Overview */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 border-b-[2px] border-black pb-2 text-xs font-mono uppercase text-[#00F5D4] font-bold">
          <Sparkles className="w-4 h-4 text-[#FFB703]" />
          <span>Deck Test Tuesday HQ • Rules of Villainy</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Streams & Matches */}
          <Link
            href="/episodes"
            className="brutal-card p-5 hover:-translate-y-1 hover:border-[#00F5D4] transition-all flex flex-col justify-between group"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 bg-[#00F5D4] border-[2px] border-black flex items-center justify-center text-black">
                <Library className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white group-hover:text-[#00F5D4] transition-colors">
                Stream &amp; Match Archive
              </h2>
              <p className="text-xs font-medium text-neutral-300 leading-relaxed">
                Explore current Hyperia City Tuesday broadcasts by Lorcana Set,
                Ink pairings, and match outcomes. Check game-by-game logs and
                watch original VODs.
              </p>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-black uppercase text-[#00F5D4]">
              <span>Explore Stream Archive</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 2: Decks */}
          <Link
            href="/episodes"
            className="brutal-card p-5 hover:-translate-y-1 hover:border-[#FFB703] transition-all flex flex-col justify-between group"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 bg-[#FFB703] border-[2px] border-black flex items-center justify-center text-black">
                <Layers className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white group-hover:text-[#FFB703] transition-colors">
                Decklists &amp; Card Inspector
              </h2>
              <p className="text-xs font-medium text-neutral-300 leading-relaxed">
                Inspect paper lists piloted on stream with high-res Lorcast card
                art, inkwell stats, ink cost mana curves, and 1-click Dreamborn
                text copy.
              </p>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-black uppercase text-[#FFB703]">
              <span>Inspect Decks</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Card 3: Community Submissions */}
          <Link
            href="/submit"
            className="brutal-card p-5 hover:-translate-y-1 hover:border-[#FF2E93] transition-all flex flex-col justify-between group"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 bg-[#FF2E93] border-[2px] border-black flex items-center justify-center text-white">
                <Send className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white group-hover:text-[#FF2E93] transition-colors">
                Submit Your Deck
              </h2>
              <p className="text-xs font-medium text-neutral-300 leading-relaxed">
                Got a spicy brew or tournament list? Submit a Dreamborn /
                Inkdecks link or paste your 60-card list for Kirsten &amp; Andy
                to review, build in paper, and test live!
              </p>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-black uppercase text-[#FF2E93]">
              <span>Submit a Deck</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </section>

      {/* Recent Streams Preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b-[2px] border-black pb-3">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-[#00F5D4]" />
            <h2 className="text-xl font-black uppercase text-white">
              Recent Tuesday Streams
            </h2>
          </div>
          <Link
            href="/episodes"
            className="brutal-btn bg-[#2E184A] text-white px-3.5 py-1.5 text-xs hover:bg-[#00F5D4] hover:text-black"
          >
            View All ({allEpisodes.length}) →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recentEpisodes.map((ep) => (
            <div
              key={ep.id}
              className="brutal-card p-4 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="text-neutral-400">{ep.stream_date}</span>
                  <span>•</span>
                  <span className="text-[#00F5D4] font-black uppercase">
                    {ep.set_name}
                  </span>
                </div>
                <Link
                  href={`/episodes/${ep.id}`}
                  className="block font-black text-lg uppercase text-white hover:text-[#00F5D4] transition-colors line-clamp-2"
                >
                  {ep.title}
                </Link>
              </div>

              {/* Decks preview */}
              <div className="space-y-2 border-t border-black/60 pt-3">
                <div className="text-[11px] font-mono text-neutral-400">
                  {ep.decks.length} Decks Tested:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ep.decks.map((d) => {
                    const played = formatPlayedBy(d);
                    return (
                      <span
                        key={d.id}
                        className="px-2 py-0.5 text-xs font-mono font-bold bg-[#1C0F2F] border border-black text-neutral-200"
                      >
                        {d.deck_name}
                        {played ? ` (${played})` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href={`/episodes/${ep.id}`}
                  className="brutal-btn bg-[#00F5D4] text-black w-full py-2 text-xs"
                >
                  View Decklists &amp; Matches
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
