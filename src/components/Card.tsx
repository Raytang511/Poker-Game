import React from 'react';
import { Card as CardType } from '../game/types';
import clsx from 'clsx';

interface CardProps {
  card?: CardType; // If undefined, render face down
  className?: string;
  isDealt?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'w-10 h-14',
  md: 'w-14 h-20 sm:w-16 sm:h-[92px]',
  lg: 'w-[72px] h-[104px] sm:w-20 sm:h-28',
};

const fontSizeMap = {
  sm: { rank: 'text-xs', suit: 'text-[10px]', center: 'text-2xl' },
  md: { rank: 'text-sm', suit: 'text-xs', center: 'text-4xl' },
  lg: { rank: 'text-lg', suit: 'text-sm', center: 'text-6xl' },
};

export default function Card({ card, className, isDealt = true, size = 'lg' }: CardProps) {
  const isRed = card?.suit === 'hearts' || card?.suit === 'diamonds';
  
  const getSuitIcon = (suit: string) => {
    switch(suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
      default: return '';
    }
  };

  const rankDisplay = card?.rank === 14 ? 'A' :
                      card?.rank === 13 ? 'K' :
                      card?.rank === 12 ? 'Q' :
                      card?.rank === 11 ? 'J' : 
                      card?.rank?.toString();

  const sizes = sizeMap[size];
  const fonts = fontSizeMap[size];

  return (
    <div 
      className={clsx(
        "relative rounded-lg select-none playing-card flex-shrink-0",
        sizes,
        isDealt ? "animate-deal" : "",
        className
      )}
    >
      {card ? (
        // Face up card
        <div className="absolute inset-0 bg-white rounded-lg overflow-hidden"
             style={{
               boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.25)'
             }}
        >
          {/* Top-left corner */}
          <div className={clsx("absolute top-1 left-1.5 flex flex-col items-center leading-none", isRed ? "text-red-500" : "text-gray-800")}>
            <span className={clsx(fonts.rank, "font-bold")}>{rankDisplay}</span>
            <span className={fonts.suit}>{getSuitIcon(card.suit)}</span>
          </div>
          
          {/* Center suit watermark */}
          <div className={clsx("absolute inset-0 flex items-center justify-center pointer-events-none", isRed ? "text-red-500/15" : "text-gray-800/10")}>
             <span className={fonts.center}>{getSuitIcon(card.suit)}</span>
          </div>
          
          {/* Bottom-right corner (rotated) */}
          <div className={clsx("absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180", isRed ? "text-red-500" : "text-gray-800")}>
            <span className={clsx(fonts.rank, "font-bold")}>{rankDisplay}</span>
            <span className={fonts.suit}>{getSuitIcon(card.suit)}</span>
          </div>
        </div>
      ) : (
        // Face down card
        <div className="absolute inset-0 rounded-lg overflow-hidden"
             style={{
               background: 'linear-gradient(135deg, #1e3a5f, #1a2744)',
               boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.3)'
             }}
        >
          <div className="absolute inset-[3px] rounded-md border border-blue-400/20"
               style={{
                 background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(100,150,255,0.06) 3px, rgba(100,150,255,0.06) 6px)',
               }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border border-blue-400/30 flex items-center justify-center">
                <span className="text-blue-400/40 text-xs font-bold">♠</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
