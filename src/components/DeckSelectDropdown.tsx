'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Lock, Search, X } from 'lucide-react';
import { LorcanaInkIcon } from './LorcanaInkIcon';
import { Deck, LorcanaInk } from '@/lib/types';

export function getInkTextColor(ink?: LorcanaInk | string | null): string {
  if (!ink) return '#9CA3AF';
  const k = ink.trim().toLowerCase();
  switch (k) {
    case 'amber':
      return '#FBBF24'; // Warm amber gold
    case 'amethyst':
      return '#C084FC'; // Vibrant purple
    case 'emerald':
      return '#4ADE80'; // Emerald green
    case 'ruby':
      return '#F87171'; // Ruby red
    case 'sapphire':
      return '#38BDF8'; // Sapphire blue
    case 'steel':
      return '#CBD5E1'; // Steel silver/slate
    default:
      return '#9CA3AF';
  }
}

interface DeckSelectDropdownProps {
  selectedDeckId: string;
  assignedDecks?: Deck[];
  otherDecks?: Deck[];
  allDecks?: Deck[];
  onSelect: (deckId: string) => void;
  disabled?: boolean;
  theme?: 'andy' | 'kirsten' | 'neutral';
  placeholder?: string;
  className?: string;
}

export function DeckSelectDropdown({
  selectedDeckId,
  assignedDecks = [],
  otherDecks = [],
  allDecks = [],
  onSelect,
  disabled = false,
  theme = 'neutral',
  placeholder = 'Select a deck...',
  className = '',
}: DeckSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Consolidate complete pool
  const pool = useMemo(() => {
    if (assignedDecks.length > 0 || otherDecks.length > 0) {
      const seen = new Set<string>();
      const combined: Deck[] = [];
      for (const d of assignedDecks) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          combined.push(d);
        }
      }
      for (const d of otherDecks) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          combined.push(d);
        }
      }
      return combined;
    }
    return allDecks;
  }, [assignedDecks, otherDecks, allDecks]);

  const selectedDeck = useMemo(
    () => pool.find((d) => d.id === selectedDeckId) || null,
    [pool, selectedDeckId]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const filterDeck = (d: Deck, q: string) => {
    if (!q) return true;
    const lower = q.toLowerCase();
    return (
      d.deck_name.toLowerCase().includes(lower) ||
      (d.ink_one && d.ink_one.toLowerCase().includes(lower)) ||
      (d.ink_two && d.ink_two.toLowerCase().includes(lower))
    );
  };

  const filteredAssigned = useMemo(
    () => assignedDecks.filter((d) => filterDeck(d, searchQuery)),
    [assignedDecks, searchQuery]
  );

  const filteredOther = useMemo(
    () => otherDecks.filter((d) => filterDeck(d, searchQuery)),
    [otherDecks, searchQuery]
  );

  const filteredAll = useMemo(
    () => (assignedDecks.length === 0 && otherDecks.length === 0 ? allDecks.filter((d) => filterDeck(d, searchQuery)) : []),
    [assignedDecks, otherDecks, allDecks, searchQuery]
  );

  const handleItemClick = (deckId: string) => {
    onSelect(deckId);
    setIsOpen(false);
  };

  const themeBorder =
    theme === 'andy'
      ? 'border-[#00F5D4]'
      : theme === 'kirsten'
        ? 'border-[#FFB703]'
        : 'border-black';

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full min-h-[52px] bg-[#181920] border-[2px] ${
          isOpen ? themeBorder : 'border-black'
        } shadow-[3px_3px_0px_#000000] px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors ${
          disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-[#20222B]'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {selectedDeck ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* 2 Ink Color Icons */}
            <div className="flex items-center gap-1 shrink-0">
              <LorcanaInkIcon ink={selectedDeck.ink_one} size={22} />
              <LorcanaInkIcon ink={selectedDeck.ink_two} size={22} />
            </div>

            {/* Deck Name and Colored Inks */}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-white truncate leading-tight">
                {selectedDeck.deck_name}
              </div>
              <div className="text-[11px] font-mono font-bold leading-tight mt-0.5 truncate">
                <span style={{ color: getInkTextColor(selectedDeck.ink_one) }}>
                  {selectedDeck.ink_one}
                </span>
                <span className="text-neutral-500 mx-1">/</span>
                <span style={{ color: getInkTextColor(selectedDeck.ink_two) }}>
                  {selectedDeck.ink_two}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-400 font-bold">{placeholder}</div>
        )}

        <div className="shrink-0 text-neutral-400">
          {disabled ? (
            <Lock className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronDown
              className={`w-5 h-5 text-[#00F5D4] transition-transform duration-200 ${
                isOpen ? 'rotate-180' : ''
              }`}
            />
          )}
        </div>
      </button>

      {/* Popover Menu */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#160D24] border-[3px] border-black shadow-[5px_5px_0px_#000000] rounded-none max-h-[380px] flex flex-col overflow-hidden animate-in fade-in-50 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b-[2px] border-black bg-[#1F1133] sticky top-0 z-10 flex items-center gap-2">
            <Search className="w-4 h-4 text-[#00F5D4] shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by deck name or ink..."
              className="w-full bg-transparent text-xs text-white placeholder-neutral-400 font-bold focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-1 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Decks Scroll List */}
          <div className="overflow-y-auto max-h-[320px] divide-y divide-black/40">
            {/* Assigned Decks Section */}
            {filteredAssigned.length > 0 && (
              <div>
                <div className="bg-[#1F1133] px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-wider text-[#00F5D4] border-b border-black/30">
                  ★ Assigned to this Stream ({filteredAssigned.length})
                </div>
                {filteredAssigned.map((d) => (
                  <DeckDropdownItem
                    key={d.id}
                    deck={d}
                    isSelected={d.id === selectedDeckId}
                    onSelect={() => handleItemClick(d.id)}
                  />
                ))}
              </div>
            )}

            {/* Other Decks Section */}
            {filteredOther.length > 0 && (
              <div>
                <div className="bg-[#1F1133] px-3 py-1.5 text-[10px] font-mono font-black uppercase tracking-wider text-[#FFB703] border-b border-black/30">
                  All Other Library Decks ({filteredOther.length})
                </div>
                {filteredOther.map((d) => (
                  <DeckDropdownItem
                    key={d.id}
                    deck={d}
                    isSelected={d.id === selectedDeckId}
                    onSelect={() => handleItemClick(d.id)}
                  />
                ))}
              </div>
            )}

            {/* Fallback All Decks (if not split into assigned/other) */}
            {filteredAll.length > 0 && (
              <div>
                {filteredAll.map((d) => (
                  <DeckDropdownItem
                    key={d.id}
                    deck={d}
                    isSelected={d.id === selectedDeckId}
                    onSelect={() => handleItemClick(d.id)}
                  />
                ))}
              </div>
            )}

            {filteredAssigned.length === 0 &&
              filteredOther.length === 0 &&
              filteredAll.length === 0 && (
                <div className="p-4 text-center text-xs text-neutral-400 font-mono">
                  No decks found matching &quot;{searchQuery}&quot;
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function DeckDropdownItem({
  deck,
  isSelected,
  onSelect,
}: {
  deck: Deck;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${
        isSelected
          ? 'bg-[#3B1F54] text-white border-l-4 border-l-[#00F5D4]'
          : 'bg-[#181920] hover:bg-[#25163C] text-neutral-200'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* 2 Ink Color Icons */}
        <div className="flex items-center gap-1 shrink-0">
          <LorcanaInkIcon ink={deck.ink_one} size={24} />
          <LorcanaInkIcon ink={deck.ink_two} size={24} />
        </div>

        {/* Deck Title & Colored Inks */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-white truncate leading-snug">
            {deck.deck_name}
          </div>
          <div className="text-[11px] font-mono font-bold leading-snug mt-0.5 truncate">
            <span style={{ color: getInkTextColor(deck.ink_one) }}>
              {deck.ink_one}
            </span>
            <span className="text-neutral-500 mx-1">/</span>
            <span style={{ color: getInkTextColor(deck.ink_two) }}>
              {deck.ink_two}
            </span>
          </div>
        </div>
      </div>

      {isSelected && (
        <Check className="w-5 h-5 text-[#00F5D4] shrink-0 font-black" />
      )}
    </button>
  );
}

