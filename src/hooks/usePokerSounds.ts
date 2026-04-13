import { useEffect, useRef } from 'react';
import { GameState } from '../game/types';
import { soundEffects } from '../lib/audio';

export function usePokerSounds(gameState: GameState | null, myId?: string) {
  const prevPot = useRef(0);
  const prevCards = useRef(0);
  const prevPhase = useRef('');
  const prevTurn = useRef('');

  useEffect(() => {
    if (!gameState) return;
    
    // 判断底池增加（有人下注）
    const currentTotalPot = gameState.pots.reduce((sum, p) => sum + p.amount, 0) + gameState.mainPot;
    if (currentTotalPot > prevPot.current && prevPot.current !== 0) {
       soundEffects.betChips();
    }
    prevPot.current = currentTotalPot;
    
    // 判断公共牌发出
    if (gameState.communityCards.length > prevCards.current) {
        soundEffects.dealCard();
        if (gameState.communityCards.length - prevCards.current > 1) {
            // Flop 发三张，稍微补多几声
            setTimeout(soundEffects.dealCard, 100);
            setTimeout(soundEffects.dealCard, 200);
        }
    }
    prevCards.current = gameState.communityCards.length;

    // 阶段进入 Showdown
    if (gameState.phase === 'showdown' && prevPhase.current !== 'showdown') {
        soundEffects.win();
    }
    prevPhase.current = gameState.phase;

    // 轮到自己操作
    const currentActivePlayer = gameState.players.find(p => p.isActiveRound);
    if (currentActivePlayer && currentActivePlayer.id === myId && prevTurn.current !== myId) {
        soundEffects.myTurn();
    }
    prevTurn.current = currentActivePlayer ? currentActivePlayer.id : '';

  }, [gameState, myId]);
}
