import React from 'react';
import { INK_CONFIG } from '@/lib/constants';
import { LorcanaInk } from '@/lib/types';

export function InkDot({
  ink,
  size = 'md',
  className = '',
}: {
  ink: LorcanaInk;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const cfg = INK_CONFIG[ink] || INK_CONFIG.Amber;
  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3.5 h-3.5',
  }[size];

  return (
    <span
      className={`${sizeClasses} rounded-full border border-black/60 shrink-0 inline-block shadow-[1px_1px_0px_#000000] ${className}`}
      style={{ backgroundColor: cfg.color }}
      title={ink}
      aria-label={ink}
    />
  );
}

interface InkBadgeProps {
  ink: LorcanaInk;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
  showSymbol?: boolean;
}

export function InkBadge({
  ink,
  size = 'md',
  showDot = false,
  showSymbol = false,
}: InkBadgeProps) {
  const cfg = INK_CONFIG[ink] || INK_CONFIG.Amber;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] border-[2px]',
    md: 'px-2.5 py-1 text-xs border-[2px]',
    lg: 'px-3.5 py-1.5 text-sm border-[3px]',
  }[size];

  const dotSize = size === 'sm' ? 'w-2 h-2' : size === 'lg' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <span
      style={{ backgroundColor: cfg.color }}
      className={`inline-flex items-center gap-1.5 font-black uppercase tracking-wider border-black shadow-[2px_2px_0px_#000000] ${cfg.textClass} ${sizeClasses}`}
    >
      {(showDot || showSymbol) && (
        <span
          className={`${dotSize} rounded-full border border-black/40 bg-black/20 shrink-0`}
          aria-hidden="true"
        />
      )}
      <span>{ink}</span>
    </span>
  );
}

interface InkPairBadgesProps {
  inkOne: LorcanaInk;
  inkTwo: LorcanaInk;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

export function InkPairBadges({
  inkOne,
  inkTwo,
  size = 'md',
  showDot = false,
}: InkPairBadgesProps) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <InkBadge ink={inkOne} size={size} showDot={showDot} />
      <InkBadge ink={inkTwo} size={size} showDot={showDot} />
    </div>
  );
}
