'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Grid,
  List,
  X,
} from 'lucide-react';
import { INK_CONFIG, formatPlayedBy } from '@/lib/constants';
import { formatDreambornExport, sanitizeExternalUrl } from '@/lib/deck-parser';
import { generateCardArtworkFallback } from '@/lib/seed-data';
import { Deck, ParsedCardEntry } from '@/lib/types';
import { InkPairBadges } from './InkBadge';

interface DeckVisualizerProps {
  deck: Deck;
}

export function DeckVisualizer({ deck }: DeckVisualizerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ParsedCardEntry | null>(
    null
  );

  const cards = useMemo(() => deck.parsed_cards || [], [deck.parsed_cards]);

  const stats = useMemo(() => {
    const totalCards = cards.reduce((acc, c) => acc + c.count, 0);
    const uninkableCards = cards
      .filter((c) => c.inkwell === false)
      .reduce((acc, c) => acc + c.count, 0);
    const inkableCards = totalCards - uninkableCards;

    const curve: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
      '6': 0,
      '7': 0,
      '8+': 0,
    };

    for (const c of cards) {
      const bucket = c.cost >= 8 ? '8+' : String(Math.max(1, c.cost || 1));
      curve[bucket] = (curve[bucket] || 0) + c.count;
    }

    const maxCurveCount = Math.max(1, ...Object.values(curve));
    const avgCost =
      totalCards > 0
        ? (
            cards.reduce((sum, c) => sum + c.cost * c.count, 0) / totalCards
          ).toFixed(2)
        : '0.00';

    return {
      totalCards,
      uninkableCards,
      inkableCards,
      curve,
      maxCurveCount,
      avgCost,
    };
  }, [cards]);

  const handleCopyDreamborn = async () => {
    const text =
      cards.length > 0
        ? formatDreambornExport(cards)
        : deck.raw_decklist.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
    }
  };

  const handleExportAsImage = async () => {
    setExporting(true);
    try {
      const canvas = document.createElement('canvas');
      const rows = Math.max(cards.length, 6);
      const height = 340 + rows * 38;
      canvas.width = 960;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#160D24';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#241438';
      ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

      const playedByAndy = Array.isArray(deck.played_by)
        ? deck.played_by.includes('Andy')
        : deck.pilot === 'Andy';
      const playedByKirsten = Array.isArray(deck.played_by)
        ? deck.played_by.includes('Kirsten')
        : deck.pilot === 'Kirsten';

      ctx.fillStyle =
        playedByAndy && !playedByKirsten
          ? '#3B1F54'
          : playedByKirsten && !playedByAndy
            ? '#FF2E93'
            : '#2A133D';
      ctx.fillRect(24, 24, canvas.width - 48, 120);
      ctx.strokeRect(24, 24, canvas.width - 48, 120);

      const playedText = formatPlayedBy(deck);
      const headerTag = playedText
        ? `DECK TEST TUESDAY • ${playedText.toUpperCase()}`
        : 'DECK TEST TUESDAY';

      ctx.fillStyle = '#00F5D4';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(headerTag, 48, 62);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 34px Impact, sans-serif';
      ctx.fillText(deck.deck_name.toUpperCase(), 48, 108);

      const inkOneColor = INK_CONFIG[deck.ink_one]?.color || '#E5A93B';
      const inkTwoColor = INK_CONFIG[deck.ink_two]?.color || '#7A8B99';

      ctx.fillStyle = inkOneColor;
      ctx.fillRect(48, 164, 150, 40);
      ctx.strokeRect(48, 164, 150, 40);
      ctx.fillStyle = '#121212';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(deck.ink_one.toUpperCase(), 72, 190);

      ctx.fillStyle = inkTwoColor;
      ctx.fillRect(212, 164, 150, 40);
      ctx.strokeRect(212, 164, 150, 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(deck.ink_two.toUpperCase(), 236, 190);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(
        `${stats.totalCards} CARDS  |  AVG COST: ${stats.avgCost}  |  UNINKABLES: ${stats.uninkableCards}`,
        390,
        190
      );

      let y = 240;
      cards.forEach((card, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#1E1F24' : '#181920';
        ctx.fillRect(48, y, canvas.width - 96, 32);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(48, y, canvas.width - 96, 32);

        ctx.fillStyle = '#121212';
        ctx.fillRect(48, y, 48, 32);
        ctx.fillStyle = '#00F5D4';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`${card.count}x`, 60, y + 22);

        ctx.fillStyle = INK_CONFIG[card.ink]?.color || '#3B1F54';
        ctx.fillRect(96, y, 42, 32);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${card.cost}`, 111, y + 22);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px sans-serif';
        const fullTitle = card.version
          ? `${card.name} - ${card.version}`
          : card.name;
        ctx.fillText(fullTitle, 154, y + 22);

        y += 36;
      });

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${deck.deck_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-dtt-deck.png`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="brutal-card p-5 space-y-5">
      {/* Deck Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b-[2px] border-black pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            {(() => {
              const played = formatPlayedBy(deck);
              if (!played) return null;
              return (
                <span
                  className={`text-xs font-mono font-black uppercase px-2.5 py-0.5 border-[2px] border-black ${
                    played.includes('Andy')
                      ? 'bg-[#3B1F54] text-[#00F5D4]'
                      : 'bg-[#FF2E93] text-white'
                  }`}
                >
                  {played}
                </span>
              );
            })()}
            <InkPairBadges inkOne={deck.ink_one} inkTwo={deck.ink_two} />
            {(() => {
              const safeDeckLink = sanitizeExternalUrl(deck.deck_link);
              if (!safeDeckLink) return null;
              return (
                <a
                  href={safeDeckLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="brutal-tag bg-[#1C0F2F] text-white hover:bg-[#00F5D4] hover:text-black"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Deck Link
                </a>
              );
            })()}
          </div>
          <h3 className="text-2xl font-black uppercase tracking-tight text-white">
            {deck.deck_name}
          </h3>
        </div>

        {cards.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyDreamborn}
              className="brutal-btn bg-[#00F5D4] text-black px-3 py-1.5 text-xs"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Dreamborn Text
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleExportAsImage}
              disabled={exporting}
              className="brutal-btn bg-[#FFB703] text-black px-3 py-1.5 text-xs"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export as Image'}
            </button>

            <div className="inline-flex border-[2px] border-black">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 text-xs font-black uppercase flex items-center gap-1 ${
                  viewMode === 'grid'
                    ? 'bg-[#00F5D4] text-black'
                    : 'bg-[#1C0F2F] text-white hover:bg-[#2E184A]'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 text-xs font-black uppercase flex items-center gap-1 border-l-[2px] border-black ${
                  viewMode === 'list'
                    ? 'bg-[#00F5D4] text-black'
                    : 'bg-[#1C0F2F] text-white hover:bg-[#2E184A]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
            </div>
          </div>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="bg-[#1C0F2F] border-[2px] border-black p-4 text-xs font-mono text-neutral-300">
          Decklist cards have not been entered yet for this deck.
        </div>
      ) : (
        <>
          {/* Compact Curve & Counts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#1C0F2F] p-4 border-[2px] border-black">
            <div className="lg:col-span-4 grid grid-cols-3 gap-2 text-center font-mono">
              <div className="bg-[#2E184A] border border-black p-2.5">
                <div className="text-[10px] uppercase text-neutral-300">
                  Cards
                </div>
                <div className="text-xl font-black text-white">
                  {stats.totalCards}
                </div>
              </div>
              <div className="bg-[#2E184A] border border-black p-2.5">
                <div className="text-[10px] uppercase text-neutral-300">
                  Avg Cost
                </div>
                <div className="text-xl font-black text-[#FFB703]">
                  {stats.avgCost}
                </div>
              </div>
              <div className="bg-[#2E184A] border border-black p-2.5">
                <div className="text-[10px] uppercase text-neutral-300">
                  Uninkable
                </div>
                <div className="text-xl font-black text-[#FF4B91]">
                  {stats.uninkableCards}
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 grid grid-cols-8 gap-2 items-end h-16">
              {Object.entries(stats.curve).map(([bucket, count]) => {
                const heightPct = Math.max(
                  8,
                  Math.round((count / stats.maxCurveCount) * 100)
                );
                return (
                  <div
                    key={bucket}
                    className="flex flex-col items-center justify-end h-full"
                  >
                    <span className="text-[10px] font-mono font-bold text-white mb-0.5">
                      {count}
                    </span>
                    <div className="w-full bg-[#2E184A] h-9 flex items-end border border-black">
                      <div
                        style={{ height: `${count > 0 ? heightPct : 0}%` }}
                        className="w-full bg-[#00F5D4]"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-neutral-300 mt-0.5">
                      {bucket}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {cards.map((card) => {
                const fallbackImg = generateCardArtworkFallback(
                  card.name,
                  card.version,
                  card.ink,
                  card.cost,
                  card.type
                );
                return (
                  <button
                    key={`${card.card_id}-${card.name}`}
                    type="button"
                    onClick={() => setSelectedCard(card)}
                    className="group text-left bg-[#1C0F2F] border-[2px] border-black shadow-[3px_3px_0px_#000000] hover:-translate-y-0.5 transition-all flex flex-col overflow-hidden"
                  >
                    <div className="relative aspect-[3/4.2] w-full bg-[#121212] border-b-[2px] border-black overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={card.image_url || fallbackImg}
                        alt={`${card.name} ${card.version}`}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            fallbackImg;
                        }}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-1.5 right-1.5 bg-[#121212] text-[#00F5D4] border border-black px-1.5 py-0.5 font-mono font-black text-xs shadow-[1.5px_1.5px_0px_#000000]">
                        {card.count}x
                      </span>
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="brutal-tag bg-[#00F5D4] text-black">
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </span>
                      </div>
                    </div>
                    <div className="p-2">
                      <div className="font-black text-xs uppercase text-white line-clamp-1">
                        {card.name}
                      </div>
                      <div className="text-[11px] font-bold text-neutral-400 line-clamp-1">
                        {card.version || card.type || 'Card'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border-[2px] border-black bg-[#1C0F2F] divide-y divide-black">
              {cards.map((card) => (
                <button
                  key={`${card.card_id}-${card.name}`}
                  type="button"
                  onClick={() => setSelectedCard(card)}
                  className="w-full px-3.5 py-2 flex items-center justify-between gap-3 hover:bg-[#2E184A] text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="bg-[#121212] text-[#00F5D4] font-mono font-black text-xs px-2 py-0.5 border border-black">
                      {card.count}x
                    </span>
                    <span className="bg-[#FFB703] text-black font-black text-xs w-6 h-6 flex items-center justify-center border border-black">
                      {card.cost}
                    </span>
                    <div className="truncate">
                      <span className="font-black text-xs sm:text-sm uppercase text-white">
                        {card.name}
                      </span>
                      {card.version && (
                        <span className="text-xs font-bold text-neutral-400 ml-2">
                          — {card.version}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      backgroundColor: INK_CONFIG[card.ink]?.color || '#E5A93B',
                    }}
                    className={`px-2 py-0.5 text-[11px] font-black uppercase border border-black shrink-0 ${
                      INK_CONFIG[card.ink]?.textClass || 'text-black'
                    }`}
                  >
                    {card.ink}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <div
          className="fixed inset-0 !mt-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedCard(null)}
        >
          <div
            className="brutal-card max-w-sm w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b-[2px] border-black pb-2">
              <div>
                <h4 className="text-lg font-black uppercase text-white">
                  {selectedCard.count}x {selectedCard.name}
                </h4>
                {selectedCard.version && (
                  <p className="text-xs font-bold text-[#00F5D4]">
                    {selectedCard.version}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="brutal-btn bg-[#FFB703] text-black p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-[3/4.2] w-full max-w-[260px] mx-auto border-[3px] border-black overflow-hidden bg-[#121212]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  selectedCard.image_url ||
                  generateCardArtworkFallback(
                    selectedCard.name,
                    selectedCard.version,
                    selectedCard.ink,
                    selectedCard.cost,
                    selectedCard.type
                  )
                }
                alt={selectedCard.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
