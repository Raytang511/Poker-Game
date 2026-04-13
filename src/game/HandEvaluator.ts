import { Card, Rank } from './types';

export enum HandRank {
  HighCard = 1,
  Pair,
  TwoPair,
  ThreeOfAKind,
  Straight,
  Flush,
  FullHouse,
  FourOfAKind,
  StraightFlush,
  RoyalFlush
}

export interface EvaluatedHand {
  rank: HandRank;
  values: number[]; // Ranks used for tie-breaking, starting from most significant (e.g. four of a kind rank) down to kickers
}

export function generateDeck(): Card[] {
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (let r = 2; r <= 14; r++) {
      deck.push({ suit, rank: r as Rank });
    }
  }
  return deck;
}

export function shuffle(deck: Card[]): Card[] {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
}

/**
 * 返回牌型的中英文名称
 */
export function getHandName(rank: HandRank): string {
  switch (rank) {
    case HandRank.RoyalFlush:    return 'Royal Flush / 皇家同花顺';
    case HandRank.StraightFlush: return 'Straight Flush / 同花顺';
    case HandRank.FourOfAKind:   return 'Four of a Kind / 四条';
    case HandRank.FullHouse:     return 'Full House / 葫芦';
    case HandRank.Flush:         return 'Flush / 同花';
    case HandRank.Straight:      return 'Straight / 顺子';
    case HandRank.ThreeOfAKind:  return 'Three of a Kind / 三条';
    case HandRank.TwoPair:       return 'Two Pair / 两对';
    case HandRank.Pair:          return 'Pair / 一对';
    case HandRank.HighCard:      return 'High Card / 高牌';
    default:                     return 'Unknown';
  }
}

/**
 * 评估由私人手牌 (2手牌) 和公共牌组成的手牌。
 * 会挑出最强的五张组合进行评估。
 */
export function evaluateHand(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) throw new Error("至少需要 5 张牌进行评估");

  // 将所有牌降序排列
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);

  const rankCounts = new Map<number, number>();
  const suitCounts = new Map<string, Card[]>();

  for (const card of sorted) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
    const suitArr = suitCounts.get(card.suit) || [];
    suitArr.push(card);
    suitCounts.set(card.suit, suitArr);
  }

  // 整理各个 Rank 出现的频次，按频次降序排序，频次相同时按点数降序
  const counts = Array.from(rankCounts.entries()).sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // 1. 同花分析 (Flush)
  let flushCards: Card[] | null = null;
  for (const [, suitCards] of suitCounts.entries()) {
    if (suitCards.length >= 5) {
      flushCards = suitCards.slice(0, 5); // 必定从大到小（因之前 sorted）
      break;
    }
  }

  // 辅助函数：找顺子最高牌 (修复版)
  const getStraightHigh = (cardsSubset: Card[]): number | null => {
    // 找出唯一并从大到小排序的 rank 数组
    const uniqueRanks: number[] = Array.from(new Set(cardsSubset.map(c => c.rank))).sort((a, b) => b - a);
    
    // 如果有A（14），补充一个1，用以支持 5,4,3,2,A 最低顺 (Wheel)
    if (uniqueRanks.includes(14)) {
      uniqueRanks.push(1);
    }

    let consecutive = 1;

    for (let i = 1; i < uniqueRanks.length; i++) {
      if (uniqueRanks[i] === uniqueRanks[i - 1] - 1) {
        consecutive++;
        if (consecutive >= 5) {
          // 顺子的最高牌 = 起始位置的 rank
          // 当前 i 是连续序列的最后一个（最小的），
          // 所以最高牌 = uniqueRanks[i] + 4
          return uniqueRanks[i] + 4;
        }
      } else {
        consecutive = 1;
      }
    }
    return null;
  };

  // 2. 同花顺 (Straight Flush) / 皇家同花顺 (Royal Flush)
  if (flushCards) {
    // 必须在凑成同花的所有牌里找是否能连成5个顺子
    // 所以取原手牌中该花色的所有牌找顺子 (可能 > 5 张)
    const allSuitCards = suitCounts.get(flushCards[0].suit)!;
    const sfHigh = getStraightHigh(allSuitCards);
    if (sfHigh) {
      if (sfHigh === 14) {
        return { rank: HandRank.RoyalFlush, values: [14] };
      }
      return { rank: HandRank.StraightFlush, values: [sfHigh] };
    }
  }

  // 3. 四条 (Four of a Kind)
  if (counts[0][1] === 4) {
    const quadRank = counts[0][0];
    const kicker = sorted.find(c => c.rank !== quadRank)!;
    return { rank: HandRank.FourOfAKind, values: [quadRank, kicker.rank] };
  }

  // 4. 葫芦 (Full House)
  if (counts[0][1] === 3 && counts.length > 1 && counts[1][1] >= 2) {
    const tripRank = counts[0][0];
    const pairRank = counts[1][0];
    return { rank: HandRank.FullHouse, values: [tripRank, pairRank] };
  }

  // 5. 同花 (Flush)
  if (flushCards) {
    return { rank: HandRank.Flush, values: flushCards.map(c => c.rank) };
  }

  // 6. 顺子 (Straight)
  const straightHigh = getStraightHigh(sorted);
  if (straightHigh) {
    return { rank: HandRank.Straight, values: [straightHigh] };
  }

  // 7. 三条 (Three of a Kind)
  if (counts[0][1] === 3) {
    const tripRank = counts[0][0];
    const kickers = sorted.filter(c => c.rank !== tripRank).slice(0, 2).map(c => c.rank);
    return { rank: HandRank.ThreeOfAKind, values: [tripRank, ...kickers] };
  }

  // 8. 两对 (Two Pair)
  if (counts[0][1] === 2 && counts[1][1] === 2) {
    const highPair = counts[0][0];
    const lowPair = counts[1][0];
    const kicker = sorted.find(c => c.rank !== highPair && c.rank !== lowPair)!;
    return { rank: HandRank.TwoPair, values: [highPair, lowPair, kicker.rank] };
  }

  // 9. 一对 (Pair)
  if (counts[0][1] === 2) {
    const pairRank = counts[0][0];
    const kickers = sorted.filter(c => c.rank !== pairRank).slice(0, 3).map(c => c.rank);
    return { rank: HandRank.Pair, values: [pairRank, ...kickers] };
  }

  // 10. 高牌 (High Card)
  return { rank: HandRank.HighCard, values: sorted.slice(0, 5).map(c => c.rank) };
}

/**
 * 比较两副手牌。返回值正数大于0即为 hand1 大，反之 hand2 大。0为平局。
 */
export function compareHands(h1: EvaluatedHand, h2: EvaluatedHand): number {
  if (h1.rank !== h2.rank) {
    return h1.rank - h2.rank;
  }
  for (let i = 0; i < h1.values.length; i++) {
    if (h1.values[i] !== h2.values[i]) {
      return h1.values[i] - h2.values[i];
    }
  }
  return 0; // 平局 Tie
}
