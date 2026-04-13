import React, { useState } from 'react';
import { HandHistoryEntry } from '../game/types';
import clsx from 'clsx';

interface HandHistoryProps {
  history: HandHistoryEntry[];
  currentPlayerId: string;
  playerNames: Record<string, string>; // id -> name
}

export default function HandHistory({ history, currentPlayerId, playerNames }: HandHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'stats'>('history');

  if (history.length === 0 && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="absolute top-2 right-2 z-30 glass-panel px-3 py-1.5 rounded-lg text-[10px] font-semibold text-gray-500 hover:text-gray-300 uppercase tracking-wider transition-all hover:border-white/20 border border-white/5"
      >
        History
      </button>
    );
  }

  // 计算各玩家累计统计
  const playerStats: Record<string, { wins: number; totalGain: number; handsPlayed: number; bestHand: string }> = {};
  const allPlayerIds = new Set<string>();

  history.forEach(h => {
    Object.entries(h.playerDeltas).forEach(([pid]) => allPlayerIds.add(pid));
    h.winners.forEach(w => allPlayerIds.add(w.playerId));
  });

  allPlayerIds.forEach(pid => {
    playerStats[pid] = { wins: 0, totalGain: 0, handsPlayed: 0, bestHand: '' };
  });

  history.forEach(h => {
    Object.entries(h.playerDeltas).forEach(([pid, delta]) => {
      if (!playerStats[pid]) playerStats[pid] = { wins: 0, totalGain: 0, handsPlayed: 0, bestHand: '' };
      playerStats[pid].totalGain += delta;
      playerStats[pid].handsPlayed++;
    });
    h.winners.forEach(w => {
      if (!playerStats[w.playerId]) playerStats[w.playerId] = { wins: 0, totalGain: 0, handsPlayed: 0, bestHand: '' };
      playerStats[w.playerId].wins++;
      if (w.handName && w.handName !== '其他人弃牌') {
        playerStats[w.playerId].bestHand = w.handName;
      }
    });
  });

  const statsArr = Array.from(allPlayerIds).map(pid => ({
    id: pid,
    name: playerNames[pid] || pid.slice(0, 8),
    ...playerStats[pid],
  })).sort((a, b) => b.totalGain - a.totalGain);

  return (
    <div className={clsx(
      "absolute top-2 right-2 z-40 glass-panel rounded-xl border border-white/10 shadow-2xl transition-all duration-300",
      expanded ? "w-72" : "w-auto"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('history')}
            className={clsx(
              "text-[10px] font-bold uppercase tracking-wider transition-colors",
              activeTab === 'history' ? "text-emerald-400" : "text-gray-500 hover:text-gray-300"
            )}
          >
            历史对局
          </button>
          <span className="text-gray-700 text-[10px]">|</span>
          <button
            onClick={() => setActiveTab('stats')}
            className={clsx(
              "text-[10px] font-bold uppercase tracking-wider transition-colors",
              activeTab === 'stats' ? "text-emerald-400" : "text-gray-500 hover:text-gray-300"
            )}
          >
            积分榜
          </button>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-600 hover:text-gray-300 text-xs transition-colors ml-3"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Collapsed state: just show button */}
      {!expanded && (
        <div className="px-3 py-1.5">
          <span className="text-[10px] text-gray-500">{history.length} 局</span>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="max-h-80 overflow-y-auto">

          {/* ── 历史对局 Tab ── */}
          {activeTab === 'history' && (
            <div className="divide-y divide-white/[0.04]">
              {history.length === 0 && (
                <p className="text-gray-600 text-[10px] text-center py-6">暂无对局记录</p>
              )}
              {[...history].reverse().map((entry, i) => {
                const myDelta = entry.playerDeltas[currentPlayerId];
                const isWinner = entry.winners.some(w => w.playerId === currentPlayerId);
                const timeStr = new Date(entry.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div key={entry.handId} className="px-3 py-2 text-[10px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-600">#{history.length - i} · {timeStr}</span>
                      <span className="text-gray-500">底池 ${entry.pot.toLocaleString()}</span>
                    </div>

                    {/* 赢家信息 */}
                    <div className="flex flex-wrap gap-1 mb-1">
                      {entry.winners.map((w, wi) => (
                        <span key={wi} className={clsx(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold",
                          w.playerId === currentPlayerId
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20"
                            : "bg-white/5 text-gray-400"
                        )}>
                          {w.playerName} +${w.potWon.toLocaleString()}
                          {w.handName && w.handName !== '其他人弃牌' && <span className="opacity-60 ml-1">({w.handName})</span>}
                        </span>
                      ))}
                    </div>

                    {/* 我的本局盈亏 */}
                    {myDelta !== undefined && (
                      <div className={clsx(
                        "text-[9px] font-mono font-bold",
                        myDelta > 0 ? "text-emerald-400" : myDelta < 0 ? "text-red-400" : "text-gray-500"
                      )}>
                        我: {myDelta > 0 ? '+' : ''}{myDelta.toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 积分榜 Tab ── */}
          {activeTab === 'stats' && (
            <div className="p-2">
              {statsArr.length === 0 && (
                <p className="text-gray-600 text-[10px] text-center py-6">暂无数据</p>
              )}
              {statsArr.map((s, i) => (
                <div
                  key={s.id}
                  className={clsx(
                    "flex items-center gap-2 px-2 py-1.5 rounded-lg mb-1",
                    s.id === currentPlayerId ? "bg-emerald-500/10 border border-emerald-500/15" : "bg-white/[0.03]"
                  )}
                >
                  <span className={clsx(
                    "text-[10px] font-bold w-4",
                    i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-600"
                  )}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={clsx(
                      "text-[10px] font-semibold truncate",
                      s.id === currentPlayerId ? "text-emerald-300" : "text-gray-300"
                    )}>
                      {s.name}
                    </p>
                    <p className="text-[9px] text-gray-600">{s.wins}胜 / {s.handsPlayed}局</p>
                  </div>
                  <span className={clsx(
                    "text-[11px] font-mono font-bold",
                    s.totalGain > 0 ? "text-emerald-400" : s.totalGain < 0 ? "text-red-400" : "text-gray-500"
                  )}>
                    {s.totalGain > 0 ? '+' : ''}{s.totalGain.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
