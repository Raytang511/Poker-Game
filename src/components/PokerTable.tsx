import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import PlayerSeat from './PlayerSeat';
import Card from './Card';
import { usePokerSounds } from '../hooks/usePokerSounds';
import { initAudio, soundEffects } from '../lib/audio';
import clsx from 'clsx';

type SeatPosition = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface SeatLayout {
  style: React.CSSProperties;
  position: SeatPosition;
}

// Seat layouts: CSS absolute positioning using percentages for responsive layout
// "You" is always at the bottom center
function getSeatLayouts(count: number): SeatLayout[] {
  if (count <= 2) {
    return [
      { style: { bottom: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'bottom' },
      { style: { top: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'top' },
    ];
  }
  if (count <= 3) {
    return [
      { style: { bottom: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'bottom' },
      { style: { top: '8%', left: '22%', transform: 'translateX(-50%)' }, position: 'top-left' },
      { style: { top: '8%', right: '22%', transform: 'translateX(50%)' }, position: 'top-right' },
    ];
  }
  if (count <= 4) {
    return [
      { style: { bottom: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'bottom' },
      { style: { top: '50%', left: '2%', transform: 'translateY(-50%)' }, position: 'left' },
      { style: { top: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'top' },
      { style: { top: '50%', right: '2%', transform: 'translateY(-50%)' }, position: 'right' },
    ];
  }
  if (count <= 6) {
    return [
      { style: { bottom: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'bottom' },
      { style: { bottom: '18%', left: '8%' }, position: 'bottom-left' },
      { style: { top: '18%', left: '8%' }, position: 'top-left' },
      { style: { top: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'top' },
      { style: { top: '18%', right: '8%' }, position: 'top-right' },
      { style: { bottom: '18%', right: '8%' }, position: 'bottom-right' },
    ];
  }
  // 7-8 max
  return [
    { style: { bottom: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'bottom' },
    { style: { bottom: '15%', left: '6%' }, position: 'bottom-left' },
    { style: { top: '50%', left: '1%', transform: 'translateY(-50%)' }, position: 'left' },
    { style: { top: '10%', left: '14%' }, position: 'top-left' },
    { style: { top: '2%', left: '50%', transform: 'translateX(-50%)' }, position: 'top' },
    { style: { top: '10%', right: '14%' }, position: 'top-right' },
    { style: { top: '50%', right: '1%', transform: 'translateY(-50%)' }, position: 'right' },
    { style: { bottom: '15%', right: '6%' }, position: 'bottom-right' },
  ];
}

export default function PokerTable() {
  const { gameState, user, performAction, isHost, startNewHand } = useGameStore();
  const [raiseAmount, setRaiseAmount] = useState<number>(0);
  const [, setTick] = useState(0);

  usePokerSounds(gameState, user?.id);

  useEffect(() => {
    window.addEventListener('click', initAudio, { once: true });
    return () => window.removeEventListener('click', initAudio);
  }, []);

  // Timer tick
  useEffect(() => {
    if (!gameState?.turnDeadline) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [gameState?.turnDeadline]);

  if (!gameState || !user) return null;

  const isMyTurn = gameState.currentTurn !== null && gameState.players[gameState.currentTurn]?.id === user.id;
  const me = gameState.players.find(p => p.id === user.id);
  const isShowdown = gameState.phase === 'showdown';
  
  const myIndex = gameState.players.findIndex(p => p.id === user.id);
  const seatLayouts = getSeatLayouts(gameState.players.length);

  const callAmount = me ? gameState.currentBet - me.bet : 0;
  const minRaise = gameState.currentBet > 0 ? (gameState.currentBet * 2) - (me?.bet || 0) : gameState.bigBlind;
  const totalPot = gameState.mainPotAmount;

  // Phase indicator
  const phaseLabel = (() => {
    switch(gameState.phase) {
      case 'pre_flop': return 'PRE-FLOP';
      case 'flop': return 'FLOP';
      case 'turn': return 'TURN';
      case 'river': return 'RIVER';
      case 'showdown': return 'SHOWDOWN';
      case 'waiting': return 'WAITING';
      default: return '';
    }
  })();

  return (
    <div className="relative w-full h-[calc(100vh-56px)] flex justify-center items-center overflow-hidden">
      
      {/* 绿色椭圆桌子 */}
      <div className="table-surface relative w-[92%] max-w-[1050px] h-[55%] md:h-[65%] rounded-full">
         
         {/* 桌布内线 */}
         <div className="table-felt absolute inset-4 rounded-full pointer-events-none"></div>

         {/* 中心区域：底池 + 阶段 + 公共牌 */}
         <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            
            {/* 底池 + 阶段 */}
            <div className="flex items-center gap-3 mb-4 -mt-8">
              <div className="bg-black/60 px-5 py-1.5 rounded-full border border-white/10 shadow-lg backdrop-blur-sm flex items-center gap-2">
                <span className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-semibold">{phaseLabel}</span>
                <span className="text-white/20">|</span>
                <span className="text-gray-400 text-xs uppercase tracking-widest font-medium">Pot</span>
                <span className="text-poker-gold font-mono text-lg font-bold tracking-wider">${totalPot.toLocaleString()}</span>
              </div>
            </div>

            {/* 边池 */}
            {gameState.pots.length > 1 && (
              <div className="flex gap-2 mb-3">
                {gameState.pots.map((p, i) => p.amount > 0 && i > 0 && (
                  <span key={i} className="text-[10px] text-yellow-300/80 font-mono bg-black/50 px-2 py-0.5 rounded border border-yellow-500/20">
                    Side ${p.amount.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
            
            {/* 公共牌 */}
            <div className="flex gap-2 sm:gap-3 pointer-events-auto">
              {[0, 1, 2, 3, 4].map(idx => (
                <div key={idx} className="relative">
                  {gameState.board[idx] ? (
                    <Card card={gameState.board[idx]} size="lg" isDealt={true} />
                  ) : (
                    <div className={clsx(
                      "w-[72px] h-[104px] sm:w-20 sm:h-28 rounded-lg border border-white/[0.04] bg-white/[0.02] flex items-center justify-center",
                    )}>
                      <span className="text-white/[0.06] font-bold text-[10px] uppercase tracking-widest">
                        {idx < 3 ? '' : idx === 3 ? '' : ''}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 等待提示 */}
            {gameState.phase === 'waiting' && !isShowdown && (
              <div className="mt-5 text-center pointer-events-auto animate-slide-up">
                <p className="text-gray-500 text-xs mb-2 tracking-wide">Waiting for players...</p>
                {isHost && gameState.players.filter(p => p.chips > 0).length >= 2 && (
                  <button 
                    onClick={startNewHand}
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 px-6 py-2 rounded-full text-xs font-bold transition-all uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:scale-105"
                  >
                    Deal Cards
                  </button>
                )}
              </div>
            )}
         </div>

         {/* 座位 */}
         {gameState.players.map((p, index) => {
            const totalPlayers = gameState.players.length;
            const shiftedIdx = myIndex >= 0 
              ? (index - myIndex + totalPlayers) % totalPlayers 
              : index;
            const layout = seatLayouts[shiftedIdx] || seatLayouts[0];

            return (
              <div key={p.id} className="absolute z-20" style={layout.style}>
                 <PlayerSeat 
                   player={p} 
                   isDealer={index === gameState.dealerIndex}
                   isActiveTurn={index === gameState.currentTurn}
                   isShowdown={isShowdown}
                   turnDeadline={index === gameState.currentTurn ? gameState.turnDeadline : null}
                   position={layout.position}
                 />
              </div>
            );
         })}
      </div>

      {/* Showdown 结果面板 */}
      {isShowdown && gameState.showdownResult && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 animate-showdown">
          <div className="glass-panel rounded-2xl px-6 py-4 min-w-[280px] max-w-[520px] shadow-2xl">
            <h3 className="text-center text-sm font-bold text-emerald-400 uppercase tracking-[0.3em] mb-3">
              🏆 Showdown
            </h3>
            
            <div className="space-y-2 mb-3">
              {gameState.showdownResult.winners.map((w, i) => (
                <div key={i} className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/15 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🏆</span>
                    <span className="font-bold text-emerald-300 text-sm">{w.playerName}</span>
                    <span className="text-gray-500 text-xs">({w.handName})</span>
                  </div>
                  <span className="text-poker-gold font-mono font-bold text-sm">+${w.potWon.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {gameState.showdownResult.playerHands.length > 0 && (
              <div className="space-y-1.5 border-t border-white/5 pt-2">
                {gameState.showdownResult.playerHands.map((ph, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-16 truncate">{ph.playerName}</span>
                    <div className="flex gap-0.5">
                      {ph.cards.map((c, ci) => (
                        <Card key={ci} card={c} size="sm" isDealt={false} />
                      ))}
                    </div>
                    <span className="text-gray-500 text-[10px]">{ph.handName}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-center text-gray-600 text-[10px] mt-3 tracking-widest uppercase">Next hand in 3s...</p>
          </div>
        </div>
      )}

      {/* 行动控制栏 */}
      {isMyTurn && me?.status === 'playing' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 animate-slide-up">
          <div className="action-bar flex items-center gap-3 px-6 py-3 rounded-2xl">
             
             <button 
               onClick={() => { soundEffects.fold(); performAction('fold'); }}
               className="px-5 py-2.5 rounded-xl font-bold bg-white/[0.06] hover:bg-white/[0.12] text-gray-400 hover:text-gray-200 transition-all uppercase tracking-widest text-xs border border-white/[0.05]"
             >
               Fold
             </button>

             <button 
               onClick={() => { callAmount > 0 ? soundEffects.call() : soundEffects.check(); performAction(callAmount > 0 ? 'call' : 'check'); }}
               className="px-6 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] transition-all uppercase tracking-widest text-xs"
             >
               {callAmount > 0 ? `Call $${callAmount}` : 'Check'}
             </button>

             {/* Raise area */}
             <div className="flex items-center gap-2 bg-white/[0.04] p-2 rounded-xl border border-white/[0.06] px-3">
                <input 
                   type="range" 
                   min={minRaise} 
                   max={me.chips} 
                   step={gameState.bigBlind}
                   value={raiseAmount < minRaise ? minRaise : raiseAmount}
                   onChange={e => setRaiseAmount(Number(e.target.value))}
                   className="w-24"
                />
                <button 
                  onClick={() => { soundEffects.raise(); performAction('raise', raiseAmount < minRaise ? minRaise : raiseAmount); }}
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(52,211,153,0.4)] hover:shadow-[0_0_25px_rgba(52,211,153,0.6)] transition-all uppercase tracking-widest text-xs whitespace-nowrap"
                >
                  Raise ${raiseAmount < minRaise ? minRaise : raiseAmount}
                </button>
             </div>
             
             <button 
               onClick={() => { soundEffects.allIn(); performAction('all_in'); }}
               className="px-5 py-2.5 rounded-xl font-black bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:shadow-[0_0_30px_rgba(220,38,38,0.7)] transition-all transform hover:scale-105 uppercase tracking-widest text-xs"
             >
               All-In
             </button>
          </div>
        </div>
      )}

      {/* Log panel */}
      <div className="absolute top-2 left-2 glass-panel p-2.5 rounded-lg text-[10px] font-mono max-h-36 overflow-y-auto hidden lg:block opacity-50 hover:opacity-90 w-52 pointer-events-auto transition-opacity log-panel">
         {gameState.lastLogs?.slice(-8).map((log, i) => (
            <div key={i} className="text-gray-400 leading-relaxed py-0.5 border-b border-white/[0.03] last:border-0">
              <span className="text-emerald-500/50 mr-1">›</span>{log}
            </div>
         ))}
      </div>
    </div>
  );
}
