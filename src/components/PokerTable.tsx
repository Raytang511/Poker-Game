import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import PlayerSeat from './PlayerSeat';
import Card from './Card';
import BettingControls from './BettingControls';
import HandHistory from './HandHistory';
import ScoreBoard from './ScoreBoard';
import ChatRoom from './ChatRoom';
import HandRankDisplay from './HandRankDisplay';
import { usePokerSounds } from '../hooks/usePokerSounds';
import { initAudio } from '../lib/audio';
import clsx from 'clsx';

type SeatPosition = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface SeatLayout {
  style: React.CSSProperties;
  position: SeatPosition;
}

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
  const { gameState, user, performAction, isHost, startNewHand, forceEndGame, buyIn, chatMessages, sendChat } = useGameStore();
  const [, setTick] = useState(0);

  usePokerSounds(gameState, user?.id);

  useEffect(() => {
    window.addEventListener('click', initAudio, { once: true });
    return () => window.removeEventListener('click', initAudio);
  }, []);

  useEffect(() => {
    if (!gameState?.turnDeadline) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [gameState?.turnDeadline]);

  // ── Track phase transitions for community card animations ──
  const prevPhaseRef = useRef<string | null>(null);
  const [phaseTransitionKey, setPhaseTransitionKey] = useState(0);

  useEffect(() => {
    if (!gameState) return;
    const currentPhase = gameState.phase;
    if (prevPhaseRef.current !== currentPhase) {
      // Phase changed — trigger animation key update
      if (['flop', 'turn', 'river'].includes(currentPhase)) {
        setPhaseTransitionKey(k => k + 1);
      }
      prevPhaseRef.current = currentPhase;
    }
  }, [gameState?.phase]);

  if (!gameState || !user) return null;

  const isMyTurn = gameState.currentTurn !== null && gameState.players[gameState.currentTurn]?.id === user.id;
  const me = gameState.players.find(p => p.id === user.id);
  const isShowdown = gameState.phase === 'showdown';

  const myIndex = gameState.players.findIndex(p => p.id === user.id);
  const seatLayouts = getSeatLayouts(gameState.players.length);

  const totalPot = gameState.mainPotAmount;
  const sidePots = gameState.pots.filter((p, i) => i > 0 && p.amount > 0);

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

  // 模式标签
  const modeLabel = gameState.roomMode === 'competitive' ? '⚔ 竞技' :
                    gameState.roomMode === 'unlimited' ? '∞ 无限注' : null;

  // 玩家名称映射（给 HandHistory 使用）
  const playerNames: Record<string, string> = {};
  gameState.players.forEach(p => { playerNames[p.id] = p.name; });

  // ── Community card animation helpers ──
  // Determine which cards are "new" in this phase transition
  const getCardFlipDelay = (idx: number): number | undefined => {
    if (gameState.phase === 'flop' && idx < 3) return idx * 180;
    if (gameState.phase === 'turn' && idx === 3) return 0;
    if (gameState.phase === 'river' && idx === 4) return 0;
    return undefined;
  };

  const shouldFlipCard = (idx: number): boolean => {
    if (gameState.phase === 'flop' && idx < 3) return true;
    if (gameState.phase === 'turn' && idx === 3) return true;
    if (gameState.phase === 'river' && idx === 4) return true;
    return false;
  };

  return (
    <div className="relative w-full h-[calc(100vh-56px)] flex justify-center items-start pt-2 overflow-hidden">

      {/* ── 绿色椭圆桌子 ── */}
      <div className="table-surface relative w-[92%] max-w-[1050px] h-[50%] md:h-[58%] rounded-full mt-1">

        <div className="table-felt absolute inset-4 rounded-full pointer-events-none"></div>

        {/* ── 中心区域 ── */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">

          {/* 底池信息 */}
          <div className="flex flex-col items-center gap-1 mb-3 -mt-8">
            {/* 主底池 + 阶段 */}
            <div className="bg-black/70 px-5 py-2 rounded-full border border-white/10 shadow-xl backdrop-blur-sm flex items-center gap-3">
              {modeLabel && (
                <>
                  <span className="text-[9px] text-amber-400/70 font-bold uppercase tracking-widest">{modeLabel}</span>
                  <span className="text-white/15">|</span>
                </>
              )}
              <span className="text-gray-500 text-[10px] uppercase tracking-[0.2em] font-semibold">{phaseLabel}</span>
              <span className="text-white/20">|</span>
              <span className="text-gray-400 text-xs uppercase tracking-widest font-medium">POT</span>
              <span className="text-poker-gold font-mono text-xl font-bold tracking-wider">
                ${totalPot.toLocaleString()}
              </span>
            </div>

            {/* 边池明细 */}
            {sidePots.length > 0 && (
              <div className="flex gap-2 pointer-events-auto">
                {sidePots.map((p, i) => (
                  <span key={i} className="text-[9px] text-yellow-300/70 font-mono bg-black/50 px-2 py-0.5 rounded border border-yellow-500/20">
                    Side #{i + 1}: ${p.amount.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 公共牌 — 带翻牌动画 */}
          <div className="flex gap-2 sm:gap-3 pointer-events-auto">
            {[0, 1, 2, 3, 4].map(idx => (
              <div key={idx} className="relative card-flip-container">
                {gameState.board[idx] ? (
                  <Card
                    card={gameState.board[idx]}
                    size="lg"
                    isDealt={false}
                    flipIn={shouldFlipCard(idx)}
                    flipDelay={getCardFlipDelay(idx)}
                    key={shouldFlipCard(idx) ? `flip-${phaseTransitionKey}-${idx}` : `static-${idx}`}
                  />
                ) : (
                  <div className="w-[72px] h-[104px] sm:w-20 sm:h-28 rounded-lg border border-white/[0.04] bg-white/[0.02]" />
                )}
              </div>
            ))}
          </div>

          {/* 等待提示 */}
          {gameState.phase === 'waiting' && !isShowdown && !gameState.gameEnded && (
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

        {/* ── 座位 ── */}
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
                  playerIndex={shiftedIdx}
                />
             </div>
           );
        })}
      </div>

      {/* ── 自己的牌型显示 ── */}
      {me && me.cards.length === 2 && gameState.board.length >= 3 && gameState.phase !== 'waiting' && (
        <div className="absolute bottom-[140px] left-1/2 -translate-x-1/2 z-25 pointer-events-none">
          <HandRankDisplay myCards={me.cards} board={gameState.board} />
        </div>
      )}

      {/* ── Showdown 结果面板 ── */}
      {isShowdown && gameState.showdownResult && !gameState.gameEnded && (
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

            <p className="text-center text-gray-600 text-[10px] mt-3 tracking-widest uppercase">
              Next hand in 3s...
            </p>
          </div>
        </div>
      )}

      {/* ── 下注操作栏 — 桌子下方居中 ── */}
      {isMyTurn && me?.status === 'playing' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 animate-slide-up w-full max-w-[820px] px-4">
          <div className="action-bar flex items-center justify-center px-5 py-3 rounded-2xl">
            <BettingControls
              me={me}
              pot={totalPot}
              currentBet={gameState.currentBet}
              bigBlind={gameState.bigBlind}
              onAction={performAction}
            />
          </div>
        </div>
      )}

      {/* ── 历史日志（左侧小面板） ── */}
      <div className="absolute top-2 left-2 glass-panel p-2.5 rounded-lg text-[10px] font-mono max-h-36 overflow-y-auto hidden lg:block opacity-50 hover:opacity-90 w-52 pointer-events-auto transition-opacity log-panel">
        {gameState.lastLogs?.slice(-8).map((log, i) => (
          <div key={i} className="text-gray-400 leading-relaxed py-0.5 border-b border-white/[0.03] last:border-0">
            <span className="text-emerald-500/50 mr-1">›</span>{log}
          </div>
        ))}
      </div>

      {/* ── 历史对局面板（右上角） ── */}
      <HandHistory
        history={gameState.handHistory ?? []}
        currentPlayerId={user.id}
        playerNames={playerNames}
      />

      {/* ── 竞技/无限注计分板 ── */}
      <ScoreBoard
        gameState={gameState}
        currentPlayerId={user.id}
        isHost={isHost}
        onForceEnd={forceEndGame}
        onBuyIn={buyIn}
      />

      {/* ── 聊天室 ── */}
      <ChatRoom
        messages={chatMessages}
        onSend={sendChat}
        currentUserId={user.id}
      />
    </div>
  );
}
