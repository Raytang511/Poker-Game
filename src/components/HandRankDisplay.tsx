import React, { useMemo } from 'react';
import { Card as CardType } from '../game/types';
import { evaluateHand, HandRank, getHandName } from '../game/HandEvaluator';

interface HandRankDisplayProps {
  myCards: CardType[];
  board: CardType[];
}

/** 简洁的中文牌型名 */
function getShortHandName(rank: HandRank): string {
  switch (rank) {
    case HandRank.RoyalFlush:    return '皇家同花顺 👑';
    case HandRank.StraightFlush: return '同花顺 🔥';
    case HandRank.FourOfAKind:   return '四条 💎';
    case HandRank.FullHouse:     return '葫芦 🏠';
    case HandRank.Flush:         return '同花 ♠';
    case HandRank.Straight:      return '顺子 📏';
    case HandRank.ThreeOfAKind:  return '三条 🎯';
    case HandRank.TwoPair:       return '两对 ✌️';
    case HandRank.Pair:          return '一对 👀';
    case HandRank.HighCard:      return '高牌';
    default:                     return '';
  }
}

/** 牌型强度映射到颜色等级 */
function getRankColor(rank: HandRank): string {
  if (rank >= HandRank.StraightFlush) return 'text-yellow-300';
  if (rank >= HandRank.FullHouse) return 'text-purple-300';
  if (rank >= HandRank.Flush) return 'text-cyan-300';
  if (rank >= HandRank.Straight) return 'text-blue-300';
  if (rank >= HandRank.ThreeOfAKind) return 'text-emerald-300';
  if (rank >= HandRank.TwoPair) return 'text-emerald-400';
  if (rank >= HandRank.Pair) return 'text-gray-300';
  return 'text-gray-500';
}

function shouldGlow(rank: HandRank): boolean {
  return rank >= HandRank.Straight;
}

export default function HandRankDisplay({ myCards, board }: HandRankDisplayProps) {
  const handInfo = useMemo(() => {
    // 至少需要手牌 2 张 + 公共牌 3 张 (flop) 才能评估
    if (myCards.length < 2 || board.length < 3) return null;

    // 过滤掉隐藏牌（rank 可能为 undefined）
    const validCards = [...myCards, ...board].filter(c => c && c.rank && c.suit);
    if (validCards.length < 5) return null;

    try {
      const result = evaluateHand(validCards);
      return {
        rank: result.rank,
        name: getShortHandName(result.rank),
        color: getRankColor(result.rank),
        glow: shouldGlow(result.rank),
      };
    } catch {
      return null;
    }
  }, [myCards, board]);

  if (!handInfo) return null;

  return (
    <div className="animate-hand-rank" key={`${handInfo.rank}-${board.length}`}>
      <div className={`
        inline-flex items-center gap-1.5 px-3 py-1 rounded-full
        bg-black/70 border border-white/10 shadow-lg backdrop-blur-sm
      `}>
        <span className={`
          text-[11px] font-bold tracking-wider
          ${handInfo.color}
          ${handInfo.glow ? 'hand-rank-glow' : ''}
        `}>
          {handInfo.name}
        </span>
      </div>
    </div>
  );
}
