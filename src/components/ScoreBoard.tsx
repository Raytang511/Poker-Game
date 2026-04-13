import React, { useState } from 'react';
import { BuyInRecord, FinalStanding, GameState } from '../game/types';
import clsx from 'clsx';

interface ScoreBoardProps {
  gameState: GameState;
  currentPlayerId: string;
  isHost: boolean;
  onForceEnd: () => void;
  onBuyIn: () => void;
}

export default function ScoreBoard({ gameState, currentPlayerId, isHost, onForceEnd, onBuyIn }: ScoreBoardProps) {
  const [open, setOpen] = useState(false);
  const mode = gameState.roomMode;

  if (mode === 'casual') return null;

  const me = gameState.players.find(p => p.id === currentPlayerId);
  const myRecord = gameState.buyInRecords.find(r => r.playerId === currentPlayerId);
  const needsBuyIn = me && me.chips === 0 && mode === 'unlimited';

  // 实时筹码排名
  const liveRanking = [...gameState.players].sort((a, b) => b.chips - a.chips);

  return (
    <>
      {/* 买入提示（无限注模式筹码耗尽） */}
      {needsBuyIn && !gameState.gameEnded && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm">
          <div className="glass-panel rounded-2xl p-8 text-center max-w-sm shadow-2xl border border-white/10">
            <p className="text-3xl mb-3">😢</p>
            <h3 className="text-lg font-bold text-white mb-2">筹码耗尽</h3>
            <p className="text-gray-400 text-sm mb-6">
              再次买入 <span className="text-poker-gold font-bold">${gameState.startingChips.toLocaleString()}</span> 筹码继续游戏？
            </p>
            <div className="text-xs text-gray-600 mb-4">
              已购买 {myRecord?.count ?? 1} 次 · 累计 ${myRecord?.totalAmount?.toLocaleString() ?? gameState.startingChips.toLocaleString()}
            </div>
            <button
              onClick={onBuyIn}
              className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all uppercase tracking-widest text-sm"
            >
              再次买入
            </button>
          </div>
        </div>
      )}

      {/* 游戏结束：最终战报 */}
      {gameState.gameEnded && gameState.finalStandings && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center backdrop-blur-sm overflow-y-auto">
          <div className="glass-panel rounded-2xl p-6 max-w-md w-full shadow-2xl border border-white/10 m-4">
            <h3 className="text-center text-lg font-bold text-poker-gold uppercase tracking-[0.3em] mb-1">游戏结束</h3>
            <p className="text-center text-gray-600 text-xs mb-5 uppercase tracking-widest">Final Standings</p>

            <div className="space-y-2 mb-5">
              {gameState.finalStandings.map((s, i) => {
                const isMe = s.playerId === currentPlayerId;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div
                    key={s.playerId}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl px-4 py-3",
                      i === 0 ? "bg-yellow-500/10 border border-yellow-500/20" :
                      isMe ? "bg-emerald-500/10 border border-emerald-500/20" :
                      "bg-white/[0.04] border border-white/[0.05]"
                    )}
                  >
                    <span className="text-lg">{medals[i] ?? `${i + 1}.`}</span>
                    <div className="flex-1">
                      <p className={clsx("font-bold text-sm", isMe ? "text-emerald-300" : "text-white")}>
                        {s.playerName} {isMe && <span className="text-[10px] opacity-60">(You)</span>}
                      </p>
                      {gameState.roomMode === 'unlimited' && (
                        <p className="text-[10px] text-gray-500">
                          买入 {gameState.buyInRecords.find(r => r.playerId === s.playerId)?.count ?? 1} 次
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-sm text-poker-gold">
                        ${s.finalChips.toLocaleString()}
                      </p>
                      <p className={clsx("font-mono text-xs", s.netGain >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {s.netGain >= 0 ? '+' : ''}{s.netGain.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 买入记录 */}
            {gameState.roomMode === 'unlimited' && gameState.buyInRecords.length > 0 && (
              <div className="border-t border-white/[0.06] pt-3 mb-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">买入记录</p>
                <div className="space-y-1">
                  {gameState.buyInRecords.map(r => (
                    <div key={r.playerId} className="flex justify-between text-[10px]">
                      <span className="text-gray-400">{r.playerName}</span>
                      <span className="text-gray-500">×{r.count} 共 ${r.totalAmount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 悬浮计分板按钮 */}
      <div className="absolute bottom-20 right-2 z-30 flex flex-col gap-2 items-end">
        {/* 强制结束按钮（仅 Host 可见，非竞技/无限注模式） */}
        {isHost && !gameState.gameEnded && (
          <button
            onClick={() => {
              if (window.confirm('确定要强制结束游戏吗？将生成最终战报。')) {
                onForceEnd();
              }
            }}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-900/40 hover:bg-red-700/60 text-red-400 hover:text-red-200 border border-red-700/30 transition-all"
          >
            强制结束
          </button>
        )}

        {/* 计分板折叠面板 */}
        <div className="glass-panel rounded-xl border border-white/10 overflow-hidden">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold text-gray-400 hover:text-white transition-colors w-full"
          >
            <span className="text-xs">{mode === 'competitive' ? '⚔' : '∞'}</span>
            <span className="uppercase tracking-wider">{mode === 'competitive' ? '竞技' : '无限注'}</span>
            <span className="ml-auto">{open ? '▼' : '▲'}</span>
          </button>

          {open && (
            <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
              {liveRanking.map((p, i) => {
                const rec = gameState.buyInRecords.find(r => r.playerId === p.id);
                const isMe = p.id === currentPlayerId;
                return (
                  <div key={p.id} className={clsx(
                    "flex items-center gap-2 px-3 py-1.5",
                    isMe && "bg-emerald-500/10"
                  )}>
                    <span className="text-[10px] text-gray-600 w-4">{i + 1}</span>
                    <span className={clsx(
                      "text-[10px] flex-1 truncate",
                      isMe ? "text-emerald-300 font-semibold" : "text-gray-400"
                    )}>
                      {p.name}
                    </span>
                    {mode === 'unlimited' && rec && (
                      <span className="text-[9px] text-gray-600">×{rec.count}</span>
                    )}
                    <span className={clsx(
                      "font-mono text-[10px] font-bold",
                      p.chips > gameState.startingChips ? "text-emerald-400" :
                      p.chips === 0 ? "text-red-500" : "text-gray-400"
                    )}>
                      ${p.chips.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
