import { useEffect, useRef } from 'react';
import { GameState } from '../game/types';
import { soundEffects } from '../lib/audio';

export function usePokerSounds(gameState: GameState | null, myId?: string) {
  const prevPot = useRef(0);
  const prevBoardLen = useRef(0);
  const prevPhase = useRef('');
  const prevTurnPlayerId = useRef('');
  const prevPlayerCount = useRef(0);

  useEffect(() => {
    if (!gameState) return;
    
    // 底池增加（有人下注）
    const currentTotalPot = gameState.mainPotAmount;
    if (currentTotalPot > prevPot.current && prevPot.current !== 0) {
       soundEffects.betChips();
    }
    prevPot.current = currentTotalPot;
    
    // 公共牌发出
    const boardLen = gameState.board.length;
    if (boardLen > prevBoardLen.current) {
        const added = boardLen - prevBoardLen.current;
        if (added >= 3) {
            // Flop：三声翻牌
            soundEffects.revealCard();
            setTimeout(soundEffects.revealCard, 150);
            setTimeout(soundEffects.revealCard, 300);
        } else {
            // Turn/River：单张翻牌
            soundEffects.revealCard();
        }
    }
    prevBoardLen.current = boardLen;

    // 新一局开始
    if (gameState.phase === 'pre_flop' && prevPhase.current !== 'pre_flop') {
        soundEffects.newHand();
        // 延迟发牌声
        setTimeout(soundEffects.dealCard, 300);
        setTimeout(soundEffects.dealCard, 450);
    }

    // Showdown
    if (gameState.phase === 'showdown' && prevPhase.current !== 'showdown') {
        // 判断是否自己赢了
        const isWinner = gameState.showdownResult?.winners.some(w => w.playerId === myId);
        if (isWinner) {
          soundEffects.win();
        } else {
          // 别人赢了，只播放普通翻牌声
          soundEffects.revealCard();
        }
    }
    prevPhase.current = gameState.phase;

    // 轮到自己操作
    if (gameState.currentTurn !== null) {
      const currentPlayer = gameState.players[gameState.currentTurn];
      if (currentPlayer && currentPlayer.id === myId && prevTurnPlayerId.current !== myId) {
        soundEffects.myTurn();
      }
      prevTurnPlayerId.current = currentPlayer?.id || '';
    } else {
      prevTurnPlayerId.current = '';
    }

    // 超时警告（剩余 < 10 秒）
    if (gameState.turnDeadline && gameState.currentTurn !== null) {
      const currentPlayer = gameState.players[gameState.currentTurn];
      if (currentPlayer?.id === myId) {
        const remaining = gameState.turnDeadline - Date.now();
        if (remaining > 0 && remaining < 10000) {
          // 这会在每次 useEffect 触发时检查，但因为 tick 是 1s 一次所以大约每秒一次
          soundEffects.timeWarning();
        }
      }
    }

  }, [gameState, myId]);
}
