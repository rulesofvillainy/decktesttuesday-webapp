'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Link2,
  Send,
  Wand2,
  X,
} from 'lucide-react';
import {
  INK_CONFIG,
  LORCANA_INKS,
  SAMPLE_DECKLIST_TEXT,
  SUBMISSION_FORMATS,
} from '@/lib/constants';
import { parseDecklistText, validateDeckUrl } from '@/lib/deck-parser';
import {
  DeckSubmission,
  LorcanaInk,
  SubmissionFormatCategory,
  SubmissionType,
} from '@/lib/types';
import { InkPairBadges } from '@/components/InkBadge';

export default function DeckSubmitPage() {
  const [deckName, setDeckName] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [inkOne, setInkOne] = useState<LorcanaInk>('Emerald');
  const [inkTwo, setInkTwo] = useState<LorcanaInk>('Steel');
  const [submissionType, setSubmissionType] =
    useState<SubmissionType>('full_list');
  const [deckLink, setDeckLink] = useState('');
  const [rawDecklist, setRawDecklist] = useState('');
  const [formatCategory, setFormatCategory] =
    useState<SubmissionFormatCategory>('Core');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] =
    useState<DeckSubmission | null>(null);

  const deckValidation = useMemo(
    () => parseDecklistText(rawDecklist),
    [rawDecklist]
  );

  const urlValidation = useMemo(() => validateDeckUrl(deckLink), [deckLink]);

  const handleLoadSampleList = () => {
    setSubmissionType('full_list');
    setRawDecklist(SAMPLE_DECKLIST_TEXT);
    if (!deckName) setDeckName('Emerald/Steel Sherwood Tempo');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!deckName.trim() || !submitterName.trim()) {
      setErrorMsg('Please enter both a Deck Name and your Submitter Name.');
      return;
    }

    if (inkOne === inkTwo) {
      setErrorMsg('Please choose two different Lorcana inks for your deck.');
      return;
    }

    if (submissionType === 'link') {
      if (!urlValidation.valid) {
        setErrorMsg(
          urlValidation.error ||
            'Please provide a valid Dreamborn or Inkdecks link.'
        );
        return;
      }
    } else {
      if (!deckValidation.isValidDecklist) {
        setErrorMsg(
          deckValidation.invalidLines.length > 0
            ? `Fix syntax on line ${deckValidation.invalidLines[0].lineNumber}: "${deckValidation.invalidLines[0].rawLine}"`
            : 'Please paste your decklist lines (e.g. "4x Robin Hood - Champion of Sherwood").'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deck_name: deckName.trim(),
          submitter_name: submitterName.trim(),
          ink_one: inkOne,
          ink_two: inkTwo,
          submission_type: submissionType,
          deck_link: deckLink.trim() || null,
          raw_decklist:
            submissionType === 'full_list' ? rawDecklist.trim() : null,
          format_category: formatCategory,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not submit deck.');
        return;
      }

      setSubmittedResult(data.submission);
    } catch {
      setErrorMsg('Network error submitting your deck. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubmittedResult(null);
    setDeckName('');
    setDeckLink('');
    setRawDecklist('');
    setNotes('');
    setErrorMsg(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b-[3px] border-black pb-4">
        <h1 className="text-3xl font-black uppercase tracking-tight text-white">
          Submit a Deck for Tuesday
        </h1>
        <p className="text-sm font-bold text-neutral-400 mt-1">
          Submit a Dreamborn/Inkdecks link or paste your 60-card list for Andy
          &amp; Kirsten to test on stream.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="brutal-card p-6 space-y-6">
        {errorMsg && (
          <div className="bg-[#D62828] text-white border-[2px] border-black p-3.5 flex items-center gap-2.5 font-bold text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase text-neutral-300">
              Deck Name *
            </label>
            <input
              type="text"
              required
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="e.g., Emerald/Steel Tempo"
              className="brutal-input text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-black uppercase text-neutral-300">
              Your Name / Handle *
            </label>
            <input
              type="text"
              required
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="e.g., @IllumineerDave"
              className="brutal-input text-sm"
            />
          </div>
        </div>

        {/* Ink Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase text-neutral-300">
              Ink One *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {LORCANA_INKS.map((ink) => {
                const cfg = INK_CONFIG[ink];
                const active = inkOne === ink;
                return (
                  <button
                    key={ink}
                    type="button"
                    onClick={() => {
                      setInkOne(ink);
                      if (ink === inkTwo) {
                        const alt =
                          LORCANA_INKS.find((i) => i !== ink) || 'Steel';
                        setInkTwo(alt);
                      }
                    }}
                    style={{
                      backgroundColor: active ? cfg.color : '#181920',
                    }}
                    className={`brutal-btn py-2 px-2 text-xs flex items-center justify-center gap-1.5 ${
                      active ? cfg.textClass : 'text-neutral-200'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/60 shrink-0 shadow-[1px_1px_0px_#000000]"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span>{ink}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-black uppercase text-neutral-300">
              Ink Two *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {LORCANA_INKS.map((ink) => {
                const cfg = INK_CONFIG[ink];
                const active = inkTwo === ink;
                const disabled = ink === inkOne;
                return (
                  <button
                    key={ink}
                    type="button"
                    disabled={disabled}
                    onClick={() => setInkTwo(ink)}
                    style={{
                      backgroundColor: active ? cfg.color : '#181920',
                    }}
                    className={`brutal-btn py-2 px-2 text-xs flex items-center justify-center gap-1.5 ${
                      active ? cfg.textClass : 'text-neutral-200'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/60 shrink-0 shadow-[1px_1px_0px_#000000]"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span>{ink}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Format Category */}
        <div className="space-y-2">
          <label className="block text-xs font-black uppercase text-neutral-300">
            Format *
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {SUBMISSION_FORMATS.map((fmt) => {
              const active = formatCategory === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormatCategory(fmt)}
                  className={`brutal-btn py-2.5 px-3 text-xs ${
                    active
                      ? 'bg-[#00F5D4] text-black shadow-[2px_2px_0px_#000000]'
                      : 'bg-[#1C0F2F] text-neutral-300 hover:text-white hover:bg-[#2E184A]'
                  }`}
                >
                  {fmt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="space-y-4 border-t-[2px] border-black pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-black uppercase text-neutral-300">
              Decklist Input:
            </span>
            <div className="inline-flex border-[2px] border-black">
              <button
                type="button"
                onClick={() => setSubmissionType('full_list')}
                className={`px-3.5 py-1.5 text-xs font-black uppercase flex items-center gap-1.5 ${
                  submissionType === 'full_list'
                    ? 'bg-[#00F5D4] text-black'
                    : 'bg-[#1C0F2F] text-neutral-300 hover:text-white hover:bg-[#2E184A]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Paste Full List
              </button>
              <button
                type="button"
                onClick={() => setSubmissionType('link')}
                className={`px-3.5 py-1.5 text-xs font-black uppercase flex items-center gap-1.5 border-l-[2px] border-black ${
                  submissionType === 'link'
                    ? 'bg-[#FF2E93] text-white'
                    : 'bg-[#1C0F2F] text-neutral-300 hover:text-white hover:bg-[#2E184A]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                Dreamborn / Inkdecks URL
              </button>
            </div>
          </div>

          {submissionType === 'link' ? (
            <div className="space-y-2">
              <input
                type="url"
                value={deckLink}
                onChange={(e) => setDeckLink(e.target.value)}
                placeholder="https://dreamborn.ink/decks/... or https://inkdecks.com/lorcana-decks/..."
                className="brutal-input text-sm"
              />
              {deckLink.trim() && (
                <div className="text-xs font-mono">
                  {urlValidation.valid ? (
                    <span className="text-[#00F5D4]">
                      ✓ Valid {urlValidation.provider} link
                    </span>
                  ) : (
                    <span className="text-[#FFB703]">
                      {urlValidation.error}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-neutral-400">
                  Cards Counted:{' '}
                  <strong className="text-[#00F5D4]">
                    {deckValidation.totalCardCount} / 60
                  </strong>{' '}
                  ({deckValidation.uniqueCardCount} lines)
                </span>
                <button
                  type="button"
                  onClick={handleLoadSampleList}
                  className="brutal-btn bg-[#1C0F2F] text-[#00F5D4] px-2.5 py-1 text-[11px] hover:bg-[#2E184A]"
                >
                  <Wand2 className="w-3 h-3" />
                  Load Sample List
                </button>
              </div>

              <textarea
                rows={10}
                value={rawDecklist}
                onChange={(e) => setRawDecklist(e.target.value)}
                placeholder={`4x Robin Hood - Champion of Sherwood\n4x Diablo - Devoted Herald\n4x Strength of a Raging Fire`}
                className="brutal-input font-mono text-xs leading-relaxed"
              />
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="block text-xs font-black uppercase text-neutral-300">
            Notes (Optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes or strategy tips for Andy & Kirsten..."
            className="brutal-input text-sm"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="brutal-btn bg-[#FF2E93] text-white px-6 py-3 text-sm hover:bg-[#FF4B91]"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : 'Submit Deck'}
          </button>
        </div>
      </form>

      {/* Success Modal */}
      {submittedResult && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="brutal-card max-w-md w-full p-6 space-y-4 relative">
            <button
              type="button"
              onClick={resetForm}
              className="brutal-btn bg-[#FFB703] text-black p-1 absolute top-4 right-4"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="inline-flex items-center gap-1.5 bg-[#00F5D4] text-black px-3 py-1 border-[2px] border-black font-black uppercase text-xs">
              <CheckCircle2 className="w-4 h-4" />
              Deck Submitted
            </div>

            <div>
              <h2 className="text-2xl font-black uppercase text-white">
                {submittedResult.deck_name}
              </h2>
              <p className="text-xs font-bold text-neutral-400 mt-0.5">
                by {submittedResult.submitter_name} •{' '}
                {submittedResult.format_category}
              </p>
            </div>

            <InkPairBadges
              inkOne={submittedResult.ink_one}
              inkTwo={submittedResult.ink_two}
            />

            {submittedResult.deck_link && (
              <a
                href={submittedResult.deck_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-mono text-[#00F5D4] underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {submittedResult.deck_link}
              </a>
            )}

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="brutal-btn bg-[#FF2E93] text-white px-4 py-2.5 text-xs flex-1"
              >
                Submit Another
              </button>
              <Link
                href="/"
                className="brutal-btn bg-[#00F5D4] text-black px-4 py-2.5 text-xs flex-1"
              >
                Back to Streams
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
