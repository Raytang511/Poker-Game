export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type PlayerState = 'playing' | 'folded' | 'all_in' | 'sitting_out';

export interface Player {
  id: string;
  name: string;
  seat: number;     // e.g. 0 to 7 (for 8-max)
  chips: number;    // Current stack remaining
  bet: number;      // Bet in the CURRENT betting round
  totalBet: number; // Total bet committed so far in this hand
  status: PlayerState;
  actedRound: boolean; // Has the player acted in the current round?
  cards: Card[];    // Private hole cards
}

export type Phase = 'waiting' | 'pre_flop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface Pot {
  amount: number;
  eligiblePlayers: string[]; // List of player IDs eligible to win this pot
}

export interface GameState {
  roomId: string;
  phase: Phase;
  players: Player[];
  dealerIndex: number;          // Index of the dealer button
  currentTurn: number | null;   // Index of the player who needs to act
  currentBet: number;           // The highest bet in the current active round
  mainPotAmount: number;        // Accumulated pot for current round
  pots: Pot[];                  // Side pots structure
  board: Card[];
  deck: Card[];
  smallBlind: number;
  bigBlind: number;
  lastLogs: string[];           // Text logs of what happened 
}

export type Action = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
