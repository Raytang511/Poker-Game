import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import PlayerSeat from './PlayerSeat';
import Card from './Card';
import { usePokerSounds } from '../hooks/usePokerSounds';
import { initAudio, soundEffects } from '../lib/audio';
import clsx from 'clsx';
import { GameState } from '../game/types';

export default function PokerTable() {
  const { gameState, user, performAction } = useGameStore();
  const [raiseAmount, setRaiseAmount] = useState<number>(0); // 结合当前盲注

  // 挂载全局监听音效，判断任何状态突变并发出声音
  usePokerSounds(gameState, user?.id);

  // 初始化音效引擎（需要用户有任意点击）
  useEffect(() => {
     window.addEventListener('click', initAudio, { once: true });
     return () => window.removeEventListener('click', initAudio);
  }, []);

  if (!gameState || !user) return null;

  const isMyTurn = gameState.currentTurn !== null && gameState.players[gameState.currentTurn]?.id === user.id;
  const me = gameState.players.find(p => p.id === user.id);
  
  // Helper to place seats symmetrically
  // 8 max, seat 0 is bottom center (You)
  // Index 0: Bottom, 1: Bottom L, 2: Mid L, 3: Top L, 4: Top, 5: Top R, 6: Mid R, 7: Bottom R
  const seatPositions = [
    "bottom-4 left-1/2 -translate-x-1/2", // Bottom (0)
    "bottom-16 left-[15%] -translate-x-1/2", // B-L (1)
    "top-1/2 left-4 -translate-y-1/2", // M-L (2)
    "top-16 left-[15%] -translate-x-1/2", // T-L (3)
    "top-4 left-1/2 -translate-x-1/2", // Top (4)
    "top-16 right-[15%] translate-x-1/2", // T-R (5)
    "top-1/2 right-4 -translate-y-1/2", // M-R (6)
    "bottom-16 right-[15%] translate-x-1/2" // B-R (7)
  ];

  const callAmount = me ? gameState.currentBet - me.bet : 0;
  const minRaise = gameState.currentBet > 0 ? (gameState.currentBet * 2) - (me?.bet || 0) : gameState.bigBlind;

  return (
    <div className="relative w-full h-[80vh] max-h-[800px] flex justify-center items-center">
      
      {/* 绿色椭圆桌子 */}
      <div className="table-surface relative w-[90%] max-w-[1000px] h-[60%] md:h-[70%] rounded-full flex flex-col justify-center items-center shadow-2xl">
         
         {/* 桌布内线纹理 */}
         <div className="table-felt absolute w-[96%] h-[92%] rounded-full opacity-60 pointer-events-none"></div>

         <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10">
            {/* 总底池 */}
            <div className="bg-black/60 px-6 py-2 rounded-full border border-white/10 mb-4 shadow-lg backdrop-blur-md">
               <span className="text-gray-400 text-sm mr-2 uppercase tracking-widest font-semibold">Pot</span>
               <span className="text-poker-gold font-mono text-xl tracking-wider">${gameState.mainPotAmount}</span>
            </div>
            
            {/* 边池 */}
            {gameState.pots.length > 1 && (
               <div className="flex gap-2">
                 {gameState.pots.map((p, i) => p.amount > 0 && i > 0 && (
                   <span key={i} className="text-xs text-yellow-300 font-mono bg-black/40 px-2 rounded-sm border border-yellow-500/20">
                     Side ${p.amount}
                   </span>
                 ))}
               </div>
            )}
         </div>

         {/* 公共牌 (Board) */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/4 flex gap-2 sm:gap-4 z-10 perspective-1000">
            {/* We render exactly 5 slots. If not dealt, we don't render face down, we render nothing. 
                Wait, standard shows space if not dealt, or renders face up if dealt. */}
            {[0, 1, 2, 3, 4].map(idx => (
              <div key={idx} className="w-16 sm:w-20 rounded-md border-2 border-white/5 opacity-40 h-24 sm:h-28 bg-black/20 flex flex-col items-center justify-center pointer-events-none" style={{
                 // Placeholder
              }}>
                {gameState.board[idx] ? (
                  <Card card={gameState.board[idx]} className="absolute inset-0 z-20 m-[-2px] border-none !opacity-100 opacity-100" />
                ) : (
                  <span className="text-white/10 font-bold text-xl">
                    {idx < 3 ? 'FLOP' : idx === 3 ? 'TURN' : 'RIVER'}
                  </span>
                )}
              </div>
            ))}
         </div>

         {/* 渲染座位 */}
         {gameState.players.map((p, index) => {
            // Find relative visual position: we always put "You" at bottom (idx 0).
            const myIndex = gameState.players.findIndex(me => me.id === user.id);
            // shift seats so myIndex is at position 0
            const shiftedIdx = (index - myIndex + 8) % 8;
            const posClass = seatPositions[shiftedIdx];

            return (
              <div key={p.id} className={clsx("absolute z-20 transition-all", posClass)}>
                 <PlayerSeat 
                   player={p} 
                   isDealer={index === gameState.dealerIndex}
                   isActiveTurn={index === gameState.currentTurn}
                 />
              </div>
            );
         })}
      </div>

      {/* 行动控制栏 (仅在自己的回合且玩牌中显示) */}
      {isMyTurn && me?.status === 'playing' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center justify-center gap-4 glass-panel px-8 py-4 rounded-3xl w-max animate-in slide-in-from-bottom-8">
           
           <button 
             onClick={() => { soundEffects.fold(); performAction('fold'); }}
             className="px-6 py-3 rounded-full font-bold bg-white/10 hover:bg-white/20 text-gray-300 transition-colors uppercase tracking-widest text-sm"
           >
             Fold
           </button>

           <button 
             onClick={() => performAction(callAmount > 0 ? 'call' : 'check')}
             className="px-8 py-3 rounded-full font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] transition-colors uppercase tracking-widest text-sm"
           >
             {callAmount > 0 ? `Call $${callAmount}` : 'Check'}
           </button>

           {/* 加注区域 */}
           <div className="flex flex-col gap-1 items-center bg-white/5 p-2 rounded-2xl border border-white/10 px-4">
              <input 
                 type="range" 
                 min={minRaise} 
                 max={me.chips} 
                 step={gameState.bigBlind}
                 value={raiseAmount < minRaise ? minRaise : raiseAmount}
                 onChange={e => setRaiseAmount(Number(e.target.value))}
                 className="w-32 accent-emerald-500"
              />
              <button 
                onClick={() => performAction('raise', raiseAmount < minRaise ? minRaise : raiseAmount)}
                className="w-full mt-1 px-6 py-2 rounded-full font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(52,211,153,0.5)] transition-colors uppercase tracking-widest text-sm"
              >
                Raise ${raiseAmount < minRaise ? minRaise : raiseAmount}
              </button>
           </div>
           
           <button 
             onClick={() => performAction('all_in')}
             className="px-6 py-3 rounded-full font-black bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white shadow-[0_0_20px_rgba(220,38,38,0.6)] transition-all transform hover:scale-105 uppercase tracking-widest text-sm ml-2"
           >
             ALL-IN
           </button>

        </div>
      )}

      {/* 简易日志输出 (可选) */}
      <div className="absolute top-4 left-4 glass-panel p-3 rounded-lg text-xs font-mono max-h-48 overflow-y-auto hidden md:block opacity-60 w-64 pointer-events-none">
         {gameState.lastLogs?.slice(-10).map((log, i) => (
            <div key={i} className="text-gray-300">» {log}</div>
         ))}
      </div>
    </div>
  );
}
