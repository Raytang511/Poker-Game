import React from 'react';
import { Player } from '../game/types';
import Card from './Card';
import clsx from 'clsx';
import { useGameStore } from '../store/useGameStore';

interface SeatProps {
  player: Player;
  isDealer?: boolean;
  isActiveTurn?: boolean;
  isShowdown?: boolean;
  turnDeadline?: number | null;
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  playerIndex?: number;
}

export default function PlayerSeat({ player, isDealer, isActiveTurn, isShowdown, turnDeadline, position, playerIndex }: SeatProps) {
  const myId = useGameStore(state => state.user?.id);
  const isMe = player.id === myId;
  const isActive = player.status === 'playing' || player.status === 'all_in';
  const fade = player.status === 'folded' || player.status === 'sitting_out' || player.status === 'waiting';
  const showRealCards = isMe || !!isShowdown;

  // Timer calculation
  const getTimerPercent = () => {
    if (!isActiveTurn || !turnDeadline) return 100;
    const remaining = Math.max(0, turnDeadline - Date.now());
    return (remaining / 30000) * 100;
  };
  const timerPercent = getTimerPercent();
  const isUrgent = timerPercent < 30;

  // Card placement: cards go BELOW for bottom positions, ABOVE for top, to the sides for left/right
  const isBottom = position === 'bottom' || position === 'bottom-left' || position === 'bottom-right';
  const isTop = position === 'top' || position === 'top-left' || position === 'top-right';

  // Bet chip direction: toward center of table 
  const betPosition = (() => {
    switch(position) {
      case 'bottom': return '-top-10 left-1/2 -translate-x-1/2';
      case 'top': return '-bottom-10 left-1/2 -translate-x-1/2';
      case 'left': return 'top-1/2 -translate-y-1/2 -right-20';
      case 'right': return 'top-1/2 -translate-y-1/2 -left-20';
      case 'bottom-left': return '-top-8 right-0 translate-x-4';
      case 'bottom-right': return '-top-8 left-0 -translate-x-4';
      case 'top-left': return '-bottom-8 right-0 translate-x-4';
      case 'top-right': return '-bottom-8 left-0 -translate-x-4';
      default: return '-top-10 left-1/2 -translate-x-1/2';
    }
  })();

  return (
    <div className={clsx(
      "relative flex items-center gap-2 transition-all duration-300", 
      fade && "opacity-35 grayscale-[0.6]",
      isBottom ? "flex-col" : isTop ? "flex-col-reverse" : "flex-row"
    )}>
      
      {/* 下注筹码 - 朝向桌子中心 */}
      {player.bet > 0 && (
        <div className={clsx("absolute z-30 animate-chip", betPosition)}>
          <div className="flex items-center gap-1 bg-black/70 px-2.5 py-1 rounded-full border border-yellow-500/30 shadow-lg">
            <span className="text-yellow-400 text-xs">🪙</span>
            <span className="font-mono text-xs text-yellow-300 font-semibold tracking-wider">{player.bet}</span>
          </div>
        </div>
      )}

      {/* 庄家标识 */}
      {isDealer && (
        <div className="absolute -right-3 -top-2 w-5 h-5 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 text-black flex items-center justify-center font-black text-[10px] shadow-lg z-30 border border-yellow-600/50">
          D
        </div>
      )}

      {/* 手牌 - 顶部玩家牌在上方，底部玩家牌在下方 */}
      {isActive && isTop && (
        <div className="flex gap-1 mb-1">
          {renderCards(player, showRealCards, playerIndex)}
        </div>
      )}

      {/* 主面板 */}
      <div className={clsx(
        "relative rounded-xl px-4 py-2.5 shadow-xl min-w-[110px] z-10 flex flex-col items-center transition-all duration-300",
        isActiveTurn 
          ? "bg-gradient-to-b from-emerald-900/80 to-black/80 border-2 border-emerald-400/70 active-turn-glow" 
          : "bg-gradient-to-b from-slate-800/90 to-black/70 border border-white/10",
        "backdrop-blur-md"
      )}>
        {/* Timer bar */}
        {isActiveTurn && turnDeadline && (
          <div className="absolute -top-0.5 left-2 right-2 h-[3px] bg-black/50 rounded-full overflow-hidden">
            <div 
              className={clsx(
                "h-full rounded-full transition-all duration-1000 ease-linear",
                isUrgent ? "bg-red-500 timer-urgent" : "bg-gradient-to-r from-emerald-400 to-emerald-300"
              )}
              style={{ width: `${timerPercent}%` }}
            />
          </div>
        )}
        
        <p className={clsx(
          "font-semibold text-xs truncate max-w-[100px]",
          isMe ? "text-emerald-300" : "text-slate-200"
        )}>
           {player.name} {isMe && <span className="text-emerald-400/60">(You)</span>}
        </p>
        
        <p className={clsx(
          "font-mono font-bold text-sm mt-0.5 tracking-wide transition-all",
          isMe
            ? "text-poker-gold"                         // 自己：正常高亮
            : "text-poker-gold/50 text-xs font-medium"  // 他人：弱化
        )}>
          ${player.chips.toLocaleString()}
        </p>

        {/* Status badges */}
        {player.status === 'folded' && (
           <span className="absolute -bottom-2.5 bg-red-600/90 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest text-white shadow-lg">Fold</span>
        )}
        {player.status === 'all_in' && (
           <span className="absolute -bottom-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest text-white shadow-lg">All In</span>
        )}
      </div>

      {/* 手牌 - 底部玩家 */}
      {isActive && !isTop && (
        <div className="flex gap-1 mt-1">
          {renderCards(player, showRealCards, playerIndex)}
        </div>
      )}
    </div>
  );
}

function renderCards(player: Player, showReal: boolean, playerIndex?: number) {
  // Stagger delay: each player's cards are offset by their index
  const baseDelay = (playerIndex ?? 0) * 200;
  if (player.cards.length === 2 && showReal) {
    return (
      <>
        <Card card={player.cards[0]} size="md" className="rotate-[-4deg]" isDealt={false} dealDelay={baseDelay} />
        <Card card={player.cards[1]} size="md" className="rotate-[4deg] -ml-3" isDealt={false} dealDelay={baseDelay + 120} />
      </>
    );
  }
  return (
    <>
      <Card size="md" className="rotate-[-4deg]" dealDelay={baseDelay} />
      <Card size="md" className="rotate-[4deg] -ml-3" dealDelay={baseDelay + 120} />
    </>
  );
}
