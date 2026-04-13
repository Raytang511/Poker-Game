import React from 'react';
import { Player } from '../game/types';
import Card from './Card';
import clsx from 'clsx';
import { useGameStore } from '../store/useGameStore';

interface SeatProps {
  player: Player;
  isDealer?: boolean;
  isActiveTurn?: boolean;
}

export default function PlayerSeat({ player, isDealer, isActiveTurn }: SeatProps) {
  const myId = useGameStore(state => state.user?.id);
  const isMe = player.id === myId;

  const showCards = player.status === 'playing' || player.status === 'all_in';
  
  // Folded 透明度降低
  const fade = player.status === 'folded' || player.status === 'sitting_out';

  return (
    <div className={clsx("relative flex flex-col items-center transition-opacity", fade && "opacity-40 grayscale-[0.5]")}>
      
      {/* 下注筹码区 */}
      {player.bet > 0 && (
        <div className="absolute -top-12 flex items-center justify-center bg-black/40 px-3 py-1 rounded-full border border-yellow-500/30 transform translate-y-[-10px]">
          <span className="text-poker-gold font-bold text-sm mr-1">🪙</span> 
          <span className="font-mono text-sm tracking-wider">{player.bet}</span>
        </div>
      )}

      {/* 庄家标识 */}
      {isDealer && (
        <div className="absolute -right-6 top-0 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs shadow-md border-2 border-gray-300 z-20">
          D
        </div>
      )}

      {/* 头像与信息面板 */}
      <div className={clsx(
        "bg-black/60 backdrop-blur-sm rounded-xl p-3 border-2 shadow-lg min-w-[120px] z-10 flex flex-col items-center transform transition-transform", 
        isActiveTurn ? "border-emerald-400 scale-105 shadow-[0_0_15px_rgba(52,211,153,0.5)]" : "border-white/10"
      )}>
        <p className="font-semibold text-sm truncate max-w-full text-slate-200">
           {player.name} {isMe && '(You)'}
        </p>
        
        <p className="text-poker-gold font-mono font-bold text-sm mt-1">
          ${player.chips}
        </p>

        {/* 状态徽章 (Folded / All-in) */}
        {player.status === 'folded' && (
           <span className="absolute -bottom-2 bg-red-600 text-[10px] px-2 rounded font-bold uppercase tracking-widest text-white border border-red-900 border-opacity-50">Folded</span>
        )}
        {player.status === 'all_in' && (
           <span className="absolute -bottom-2 bg-purple-600 text-[10px] px-2 rounded font-bold uppercase tracking-widest text-white border border-purple-900 border-opacity-50">All In</span>
        )}
      </div>

      {/* 手牌显示 */}
      {showCards && (
         <div className="absolute bottom-[-30px] sm:bottom-[-40px] flex px-2 pointer-events-none perspective-1000">
            {player.cards.length === 2 ? (
                // 若为自身，或者是showdown阶段且卡牌可见，就渲染真实牌，否则渲染背面
                <>
                  <Card card={(isMe || player.cards.length > 0) ? player.cards[0] : undefined} className="origin-bottom-left rotate-[-5deg] scale-75" isDealt={false} />
                  <Card card={(isMe || player.cards.length > 0) ? player.cards[1] : undefined} className="origin-bottom-right rotate-[5deg] scale-75 -ml-8 sm:-ml-12" isDealt={false} />
                </>
            ) : (
                // 没发到客户端则默认2张盖着的牌
                <>
                  <Card className="origin-bottom-left rotate-[-5deg] scale-75" />
                  <Card className="origin-bottom-right rotate-[5deg] scale-75 -ml-8 sm:-ml-12" />
                </>
            )}
         </div>
      )}
    </div>
  );
}
