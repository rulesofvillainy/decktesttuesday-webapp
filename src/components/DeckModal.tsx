'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Deck } from '@/lib/types';
import { DeckVisualizer } from './DeckVisualizer';

interface DeckModalProps {
  deck: Deck | null;
  onClose: () => void;
}

export function DeckModal({ deck, onClose }: DeckModalProps) {
  if (!deck) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl my-auto bg-[#241438] border-[3px] border-black shadow-[6px_6px_0px_#000000] relative max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-[#1C0F2F] border-b-[3px] border-black p-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-black uppercase text-[#00F5D4]">
              Deck Inspector
            </span>
            {deck.assigned_episodes && deck.assigned_episodes.length > 0 && (
              <span className="text-[11px] font-mono text-neutral-300">
                • Tested on {deck.assigned_episodes.length} stream(s)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="brutal-btn bg-[#FFB703] text-black p-1.5"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {deck.assigned_episodes && deck.assigned_episodes.length > 0 && (
            <div className="bg-[#1C0F2F] border-[2px] border-black p-3 space-y-1">
              <span className="text-[10px] font-mono uppercase text-[#00F5D4] font-bold">
                Tested on DTT Streams:
              </span>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {deck.assigned_episodes.map((ep) => (
                  <span
                    key={ep.episode_id}
                    className="text-xs font-mono bg-[#2E184A] border border-black px-2 py-0.5 text-neutral-200"
                  >
                    [{ep.stream_date}] {ep.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DeckVisualizer deck={deck} />
        </div>
      </div>
    </div>
  );
}
