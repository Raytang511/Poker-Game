export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type PlayerState = 'waiting' | 'playing' | 'folded' | 'all_in' | 'sitting_out';

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

export interface ShowdownPlayerResult {
  playerId: string;
  playerName: string;
  cards: Card[];
  handName: string;     // e.g. "Full House / 葫芦"
  handRankValue: number;
}

export interface ShowdownResult {
  winners: { playerId: string; playerName: string; potWon: number; handName: string }[];
  playerHands: ShowdownPlayerResult[];
}

export interface GameState {
  roomId: string;
  phase: Phase;
  players: Player[];
  dealerIndex: number;          // Index of the dealer button
  currentTurn: number | null;   // Index of the player who needs to act
  currentBet: number;           // The highest bet in the current active round
  mainPotAmount: number;        // Total accumulated pot display value
  pots: Pot[];                  // Side pots structure
  board: Card[];
  deck: Card[];
  smallBlind: number;
  bigBlind: number;
  lastRaiseSize: number;        // Last raise increment for minimum re-raise tracking
  turnDeadline: number | null;  // Unix timestamp when current player must act by
  showdownResult: ShowdownResult | null; // Showdown results for UI display
  lastLogs: string[];           // Text logs of what happened 
}

export type Action = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
