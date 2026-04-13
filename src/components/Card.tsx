import React from 'react';
import { Card as CardType } from '../game/types';
import clsx from 'clsx';

interface CardProps {
  card?: CardType; // If undefined, render face down
  className?: string;
  isDealt?: boolean;
}

export default function Card({ card, className, isDealt = true }: CardProps) {
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
                      card?.rank;

  return (
    <div 
      className={clsx(
        "relative w-16 h-24 sm:w-20 sm:h-28 rounded-md shadow-xl select-none playing-card-hover",
        isDealt ? "animate-deal flex-shrink-0" : "",
        className
      )}
    >
      {card ? (
        // Face up
        <div className="absolute inset-0 bg-white rounded-md border border-gray-300 flex flex-col justify-between p-1.5 overflow-hidden">
          {/* Top-left */}
          <div className={clsx("flex flex-col items-center leading-none", isRed ? "text-red-600" : "text-black")}>
            <span className="text-lg font-bold tracking-tighter">{rankDisplay}</span>
            <span className="text-sm">{getSuitIcon(card.suit)}</span>
          </div>
          
          {/* Center */}
          <div className={clsx("absolute inset-0 flex items-center justify-center pointer-events-none opacity-20", isRed ? "text-red-600" : "text-black")}>
             <span className="text-6xl">{getSuitIcon(card.suit)}</span>
          </div>
          
          {/* Bottom-right */}
          <div className={clsx("flex flex-col items-center leading-none rotate-180", isRed ? "text-red-600" : "text-black")}>
            <span className="text-lg font-bold tracking-tighter">{rankDisplay}</span>
            <span className="text-sm">{getSuitIcon(card.suit)}</span>
          </div>
        </div>
      ) : (
        // Face down (Card Back)
        <div className="absolute inset-0 bg-blue-800 rounded-md border-2 border-white flex items-center justify-center p-1">
           <div className="w-full h-full border border-blue-400 opacity-60 rounded-sm" style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.1) 4px, rgba(255,255,255,0.1) 8px)'
           }} />
        </div>
      )}
    </div>
  );
}
