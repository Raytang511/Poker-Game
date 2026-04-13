import { GameState, Phase, Player, Action, Pot, Card, ShowdownResult, ShowdownPlayerResult, RoomMode, HandHistoryEntry, BuyInRecord, FinalStanding } from './types';
import { generateDeck, shuffle, evaluateHand, compareHands, getHandName, EvaluatedHand } from './HandEvaluator';

const ACTION_TIMEOUT_MS = 30_000; // 30 seconds per action
const MAX_HAND_HISTORY = 30;

export class GameStateEngine {
  private state: GameState;
  // 记录每局开始时各玩家筹码（用于计算 delta）
  private handStartChips: Record<string, number> = {};

  constructor(initialState?: GameState, smallBlind: number = 1, bigBlind: number = 2, roomMode: RoomMode = 'casual', startingChips?: number) {
    if (initialState) {
      this.state = initialState;
      // 确保新字段存在（兼容旧 state）
      if (!this.state.roomMode) this.state.roomMode = roomMode;
      if (!this.state.startingChips) this.state.startingChips = startingChips ?? 5000;
      if (!this.state.handHistory) this.state.handHistory = [];
      if (!this.state.buyInRecords) this.state.buyInRecords = [];
      if (this.state.gameEnded === undefined) this.state.gameEnded = false;
      if (this.state.finalStandings === undefined) this.state.finalStandings = null;
    } else {
      this.state = {
        roomId: 'room-1',
        phase: 'waiting',
        players: [],
        dealerIndex: -1,
        currentTurn: null,
        currentBet: 0,
        mainPotAmount: 0,
        pots: [],
        board: [],
        deck: [],
        smallBlind,
        bigBlind,
        lastRaiseSize: bigBlind,
        turnDeadline: null,
        showdownResult: null,
        lastLogs: [],
        roomMode,
        startingChips: startingChips ?? 5000,
        handHistory: [],
        buyInRecords: [],
        gameEnded: false,
        finalStandings: null,
      };
    }
  }

  getState(): GameState {
    return this.state;
  }

  log(msg: string) {
    this.state.lastLogs.push(msg);
    if (this.state.lastLogs.length > 50) this.state.lastLogs.shift();
  }

  // --- 1. 座位与玩家管理 ---
  addPlayer(player: Omit<Player, 'bet' | 'totalBet' | 'status' | 'actedRound' | 'cards'>) {
    if (this.state.players.find(p => p.id === player.id)) {
      throw new Error("玩家已在房间中");
    }
    this.state.players.push({
      ...player,
      bet: 0,
      totalBet: 0,
      status: 'waiting',
      actedRound: false,
      cards: []
    });
    // 初始化买入记录
    if (!this.state.buyInRecords.find(r => r.playerId === player.id)) {
      this.state.buyInRecords.push({
        playerId: player.id,
        playerName: player.name,
        count: 1,
        totalAmount: player.chips,
      });
    }
    this.log(`玩家 ${player.name} 加入了房间`);
  }

  removePlayer(playerId: string) {
    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      // 如果在游戏中，先视作弃牌
      if (player.status === 'playing' || player.status === 'all_in') {
        player.status = 'folded';
        // 如果当前轮到该玩家，推进游戏
        if (this.state.currentTurn !== null && this.state.players[this.state.currentTurn]?.id === playerId) {
          this.checkRoundEnd();
        }
      }
      this.state.players = this.state.players.filter(p => p.id !== playerId);
      this.log(`玩家 ${player.name} 离开了房间`);
    }
  }

  // --- 2. 无限注模式：买入 ---
  buyIn(playerId: string): void {
    if (this.state.roomMode !== 'unlimited') {
      throw new Error("只有无限注模式才能买入");
    }
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) throw new Error("玩家不存在");
    if (player.chips > 0) throw new Error("筹码未耗尽，无需买入");

    const amount = this.state.startingChips;
    player.chips += amount;
    player.status = 'waiting'; // 等待下一局

    const rec = this.state.buyInRecords.find(r => r.playerId === playerId);
    if (rec) {
      rec.count++;
      rec.totalAmount += amount;
    } else {
      this.state.buyInRecords.push({ playerId, playerName: player.name, count: 2, totalAmount: amount * 2 });
    }
    this.log(`${player.name} 再次买入 ${amount} 筹码`);
  }

  // --- 3. Host 强制结束游戏 ---
  forceEndGame(): void {
    this.state.gameEnded = true;
    this.state.phase = 'showdown';
    this.state.currentTurn = null;
    this.state.turnDeadline = null;

    // 如果还有底池未结算，退还给玩家
    if (this.state.pots.length > 0 || this.state.players.some(p => p.bet > 0)) {
      // 按比例退还
      this.state.players.forEach(p => {
        p.chips += p.bet;
        p.bet = 0;
      });
      this.state.pots.forEach(pot => {
        const eligible = this.state.players.filter(p => pot.eligiblePlayers.includes(p.id));
        if (eligible.length > 0) {
          const share = Math.floor(pot.amount / eligible.length);
          eligible.forEach(p => p.chips += share);
        }
        pot.amount = 0;
      });
      this.state.pots = [];
    }

    // 生成最终排名
    const standings: FinalStanding[] = this.state.players.map(p => {
      const rec = this.state.buyInRecords.find(r => r.playerId === p.id);
      const totalBuyIn = rec ? rec.totalAmount : this.state.startingChips;
      return {
        playerId: p.id,
        playerName: p.name,
        finalChips: p.chips,
        totalBuyIn,
        netGain: p.chips - totalBuyIn,
        rank: 0,
      };
    }).sort((a, b) => b.finalChips - a.finalChips);

    standings.forEach((s, i) => s.rank = i + 1);
    this.state.finalStandings = standings;

    this.log("游戏已结束，生成最终战报");
    this.updateMainPotDisplay();
  }

  // --- 4. 游戏核心流程控制 ---
  startNewHand() {
    if (this.state.gameEnded) {
      this.log("游戏已结束");
      return;
    }

    // 筛选出有筹码的活跃玩家
    const eligiblePlayers = this.state.players.filter(p => p.chips > 0);
    if (eligiblePlayers.length < 2) {
      this.log("人数不足，等待更多玩家");
      this.state.phase = 'waiting';
      return;
    }

    // 竞技模式：只剩一名玩家时自动结束
    if (this.state.roomMode === 'competitive' && eligiblePlayers.length === 1) {
      this.forceEndGame();
      return;
    }

    // 记录本局开始时的筹码快照
    this.handStartChips = {};
    this.state.players.forEach(p => {
      this.handStartChips[p.id] = p.chips;
    });

    // 初始化玩家状态
    this.state.players.forEach(p => {
      if (p.chips <= 0) {
        p.status = 'sitting_out';
      } else {
        p.status = 'playing';
      }
      p.bet = 0;
      p.totalBet = 0;
      p.actedRound = false;
      p.cards = [];
    });

    this.state.board = [];
    this.state.deck = shuffle(generateDeck());
    this.state.pots = [];
    this.state.mainPotAmount = 0;
    this.state.currentBet = 0;
    this.state.lastRaiseSize = this.state.bigBlind;
    this.state.turnDeadline = null;
    this.state.showdownResult = null;
    this.state.phase = 'pre_flop';

    // 移动庄家(Button)
    let dealerFound = false;
    let attempts = 0;
    while (!dealerFound && attempts < this.state.players.length) {
      this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
      if (this.state.players[this.state.dealerIndex].status === 'playing') {
        dealerFound = true;
      }
      attempts++;
    }

    const sbIndex = this.getNextActivePlayerIndex(this.state.dealerIndex);
    const bbIndex = this.getNextActivePlayerIndex(sbIndex);

    // 下盲注
    this.postBlind(this.state.players[sbIndex], this.state.smallBlind, "小盲");
    this.postBlind(this.state.players[bbIndex], this.state.bigBlind, "大盲");
    this.state.currentBet = this.state.bigBlind;

    // 发两张底牌
    for (let i = 0; i < 2; i++) {
      this.state.players.forEach(p => {
        if (p.status === 'playing' || p.status === 'all_in') {
          p.cards.push(this.state.deck.pop()!);
        }
      });
    }

    // 确定下个行动玩家（大盲位的下一位，即 UTG）
    this.state.currentTurn = this.getNextActivePlayerIndex(bbIndex);
    this.setTurnDeadline();

    // 更新底池显示值
    this.updateMainPotDisplay();

    this.log("新的一局开始了 (Pre-flop)");
  }

  private postBlind(player: Player, blindAmount: number, type: string) {
    const amount = Math.min(player.chips, blindAmount);
    player.chips -= amount;
    player.bet += amount;
    player.totalBet += amount;
    if (player.chips === 0) {
      player.status = 'all_in';
    }
    this.log(`${player.name} 下${type}注: ${amount}`);
  }

  // --- 5. 玩家动作处理 ---
  processAction(playerId: string, action: Action, amount: number = 0) {
    if (this.state.currentTurn === null) throw new Error("当前不在行动阶段");
    const player = this.state.players[this.state.currentTurn];

    if (player.id !== playerId) {
      throw new Error(`当前不轮到 ${playerId} 行动（当前轮到 ${player.id}）`);
    }
    if (player.status !== 'playing') {
      throw new Error(`玩家状态异常: ${player.status}`);
    }

    let actAmount = 0;

    switch (action) {
      case 'fold':
        player.status = 'folded';
        this.log(`${player.name} 弃牌 (Fold)`);
        break;

      case 'check':
        if (this.state.currentBet > player.bet) {
          throw new Error("已有下注，无法 Check，必须 Call 或 Raise");
        }
        player.actedRound = true;
        this.log(`${player.name} 过牌 (Check)`);
        break;

      case 'call':
        actAmount = Math.min(player.chips, this.state.currentBet - player.bet);
        this.commitBet(player, actAmount);
        player.actedRound = true;
        this.log(`${player.name} 跟注 (Call) ${actAmount}`);
        break;

      case 'bet':
      case 'raise': {
        const minRaiseTotal = this.state.currentBet + this.state.lastRaiseSize;
        const totalNeeded = amount;
        const raiseToTarget = player.bet + totalNeeded;

        if (raiseToTarget < minRaiseTotal && totalNeeded < player.chips) {
          throw new Error(`加注额不足，最小加注到 ${minRaiseTotal}，当前尝试到 ${raiseToTarget}`);
        }

        actAmount = Math.min(player.chips, totalNeeded);
        this.commitBet(player, actAmount);

        if (player.bet > this.state.currentBet) {
          const raiseIncrement = player.bet - this.state.currentBet;
          this.state.lastRaiseSize = Math.max(this.state.lastRaiseSize, raiseIncrement);
          this.state.currentBet = player.bet;
          this.state.players.forEach(p => {
             if (p.id !== player.id && p.status === 'playing') p.actedRound = false;
          });
        }
        player.actedRound = true;
        this.log(`${player.name} ${action} ${actAmount} (总下注: ${player.bet})`);
        break;
      }

      case 'all_in':
        actAmount = player.chips;
        this.commitBet(player, actAmount);
        if (player.bet > this.state.currentBet) {
          const raiseIncrement = player.bet - this.state.currentBet;
          this.state.lastRaiseSize = Math.max(this.state.lastRaiseSize, raiseIncrement);
          this.state.currentBet = player.bet;
          this.state.players.forEach(p => {
             if (p.id !== player.id && p.status === 'playing') p.actedRound = false;
          });
        }
        player.status = 'all_in';
        player.actedRound = true;
        this.log(`${player.name} 全下 (All-In) ${actAmount}`);
        break;
    }

    this.updateMainPotDisplay();
    this.checkRoundEnd();
  }

  checkTimeout(): boolean {
    if (this.state.currentTurn === null || this.state.turnDeadline === null) return false;
    if (Date.now() < this.state.turnDeadline) return false;

    const player = this.state.players[this.state.currentTurn];
    if (player.status !== 'playing') return false;

    this.log(`${player.name} 超时自动弃牌 (Timeout Fold)`);
    player.status = 'folded';
    this.updateMainPotDisplay();
    this.checkRoundEnd();
    return true;
  }

  private commitBet(player: Player, amount: number) {
    if (amount <= 0) return;
    player.chips -= amount;
    player.bet += amount;
    player.totalBet += amount;
    if (player.chips === 0) {
      player.status = 'all_in';
    }
  }

  private setTurnDeadline() {
    if (this.state.currentTurn !== null) {
      this.state.turnDeadline = Date.now() + ACTION_TIMEOUT_MS;
    } else {
      this.state.turnDeadline = null;
    }
  }

  private updateMainPotDisplay() {
    const collectedPots = this.state.pots.reduce((sum, p) => sum + p.amount, 0);
    const currentBets = this.state.players.reduce((sum, p) => sum + p.bet, 0);
    this.state.mainPotAmount = collectedPots + currentBets;
  }

  private getNextActivePlayerIndex(startIndex: number): number {
    let next = startIndex;
    const len = this.state.players.length;
    for (let i = 0; i < len; i++) {
      next = (next + 1) % len;
      const status = this.state.players[next].status;
      if (status === 'playing') {
        return next;
      }
    }
    return next;
  }

  private countActivePlayers(): number {
    return this.state.players.filter(p => p.status === 'playing' || p.status === 'all_in').length;
  }

  private countCanActPlayers(): number {
    return this.state.players.filter(p => p.status === 'playing').length;
  }

  private checkRoundEnd() {
    const active = this.countActivePlayers();

    if (active === 1) {
      this.handleEarlyWin();
      return;
    }

    if (active === 0) {
      this.state.phase = 'waiting';
      this.state.currentTurn = null;
      this.state.turnDeadline = null;
      return;
    }

    const needToAct = this.state.players.filter(p => p.status === 'playing' && (!p.actedRound || p.bet < this.state.currentBet));

    if (needToAct.length === 0) {
      this.collectPots();

      if (this.countCanActPlayers() <= 1) {
        this.autoDealToRiver();
        return;
      }

      this.advancePhase();
    } else {
      this.state.currentTurn = this.getNextActivePlayerIndex(this.state.currentTurn!);
      this.setTurnDeadline();
    }
  }

  private collectPots() {
    const bets = this.state.players.filter(p => p.bet > 0).map(p => p.bet);
    const uniqueBets = Array.from(new Set(bets)).sort((a,b) => a - b);

    let previousBet = 0;

    for (const amount of uniqueBets) {
      let potSlice = 0;
      const sliceSize = amount - previousBet;
      const eligibleIds: string[] = [];

      this.state.players.forEach(p => {
        if (p.bet >= amount) {
          potSlice += sliceSize;
          if (p.status !== 'folded') {
            eligibleIds.push(p.id);
          }
        }
      });

      if (potSlice > 0) {
        if (this.state.pots.length > 0) {
          const lastPot = this.state.pots[this.state.pots.length - 1];
          if (JSON.stringify(lastPot.eligiblePlayers.sort()) === JSON.stringify(eligibleIds.sort())) {
            lastPot.amount += potSlice;
          } else {
            this.state.pots.push({ amount: potSlice, eligiblePlayers: eligibleIds });
          }
        } else {
          this.state.pots.push({ amount: potSlice, eligiblePlayers: eligibleIds });
        }
      }

      previousBet = amount;
    }

    this.state.players.forEach(p => {
      p.actedRound = false;
      p.bet = 0;
    });
    this.state.currentBet = 0;
    this.state.lastRaiseSize = this.state.bigBlind;

    this.updateMainPotDisplay();
  }

  private advancePhase() {
    switch (this.state.phase) {
      case 'pre_flop':
        this.dealBoardCards(3);
        this.state.phase = 'flop';
        this.log(`发翻牌 (Flop): ${this.getBoardString(0,3)}`);
        break;
      case 'flop':
        this.dealBoardCards(1);
        this.state.phase = 'turn';
        this.log(`发转牌 (Turn): ${this.getBoardString(3,4)}`);
        break;
      case 'turn':
        this.dealBoardCards(1);
        this.state.phase = 'river';
        this.log(`发河牌 (River): ${this.getBoardString(4,5)}`);
        break;
      case 'river':
        this.state.phase = 'showdown';
        this.handleShowdown();
        return;
    }

    this.state.currentTurn = this.getNextActivePlayerIndex(this.state.dealerIndex);
    this.setTurnDeadline();
  }

  private autoDealToRiver() {
    this.log("大部分玩家已全下，自动发剩余公共牌...");
    while (this.state.phase !== 'river' && this.state.phase !== 'showdown') {
      this.advancePhase();
    }
    if (this.state.phase === 'river') {
      this.state.phase = 'showdown';
      this.handleShowdown();
    }
  }

  private dealBoardCards(count: number) {
    for (let i = 0; i < count; i++) {
        this.state.board.push(this.state.deck.pop()!);
    }
  }

  private getBoardString(start: number, end: number) {
    return this.state.board.slice(start, end).map(c => `${c.rank}${c.suit.charAt(0)}`).join(', ');
  }

  private handleEarlyWin() {
    const winner = this.state.players.find(p => p.status === 'playing' || p.status === 'all_in');
    if (!winner) {
      this.state.phase = 'waiting';
      this.state.currentTurn = null;
      this.state.turnDeadline = null;
      return;
    }

    let totalWin = 0;
    this.state.players.forEach(p => {
      totalWin += p.bet;
      p.bet = 0;
    });
    this.state.pots.forEach(pot => totalWin += pot.amount);

    winner.chips += totalWin;

    const winnerResult = [{ playerId: winner.id, playerName: winner.name, potWon: totalWin, handName: '其他人弃牌' }];

    this.state.showdownResult = {
      winners: winnerResult,
      playerHands: []
    };

    this.recordHandHistory(winnerResult, []);

    this.log(`${winner.name} 赢得了 ${totalWin} (其他人弃牌)`);
    this.state.phase = 'showdown';
    this.state.currentTurn = null;
    this.state.turnDeadline = null;
    this.state.pots = [];
    this.updateMainPotDisplay();
  }

  // --- 6. 结算比牌 ---
  private handleShowdown() {
    this.log("进入摊牌结算阶段 (Showdown)!");

    const playerResults: { p: Player; evalHand: EvaluatedHand }[] = [];
    const showdownHands: ShowdownPlayerResult[] = [];

    this.state.players.forEach(p => {
      if (p.status !== 'folded' && p.status !== 'sitting_out' && p.status !== 'waiting') {
        const h = evaluateHand([...p.cards, ...this.state.board]);
        playerResults.push({ p, evalHand: h });
        showdownHands.push({
          playerId: p.id,
          playerName: p.name,
          cards: [...p.cards],
          handName: getHandName(h.rank),
          handRankValue: h.rank
        });
      }
    });

    const allWinners: ShowdownResult['winners'] = [];

    for (let i = 0; i < this.state.pots.length; i++) {
      const pot = this.state.pots[i];
      if (pot.amount === 0) continue;

      const eligibleResults = playerResults.filter(pr => pot.eligiblePlayers.includes(pr.p.id));
      if (eligibleResults.length === 0) continue;

      eligibleResults.sort((a, b) => compareHands(b.evalHand, a.evalHand));

      const winners = [eligibleResults[0]];
      for (let j = 1; j < eligibleResults.length; j++) {
        if (compareHands(winners[0].evalHand, eligibleResults[j].evalHand) === 0) {
          winners.push(eligibleResults[j]);
        } else {
          break;
        }
      }

      const winAmount = Math.floor(pot.amount / winners.length);
      winners.forEach(w => {
        w.p.chips += winAmount;
        const handName = getHandName(w.evalHand.rank);
        allWinners.push({ playerId: w.p.id, playerName: w.p.name, potWon: winAmount, handName });
        this.log(`${w.p.name} 赢得了底池 ${winAmount} (${handName})`);
      });

      pot.amount = 0;
    }

    this.state.showdownResult = {
      winners: allWinners,
      playerHands: showdownHands
    };

    this.recordHandHistory(allWinners, showdownHands);

    this.state.currentTurn = null;
    this.state.turnDeadline = null;
    this.updateMainPotDisplay();
  }

  // --- 7. 记录手牌历史 ---
  private recordHandHistory(
    winners: { playerId: string; playerName: string; potWon: number; handName: string }[],
    playerHands: ShowdownPlayerResult[]
  ) {
    const totalPot = winners.reduce((s, w) => s + w.potWon, 0);

    // 计算各玩家本局净收益
    const playerDeltas: Record<string, number> = {};
    this.state.players.forEach(p => {
      const startChips = this.handStartChips[p.id] ?? p.chips;
      playerDeltas[p.id] = p.chips - startChips;
    });

    const entry: HandHistoryEntry = {
      handId: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now(),
      pot: totalPot,
      winners,
      playerHands,
      playerDeltas,
    };

    this.state.handHistory.push(entry);
    if (this.state.handHistory.length > MAX_HAND_HISTORY) {
      this.state.handHistory.shift();
    }
  }

  getSanitizedStateFor(forPlayerId: string): GameState {
    const cloned = JSON.parse(JSON.stringify(this.state)) as GameState;

    if (cloned.phase === 'showdown') {
      cloned.deck = [];
      return cloned;
    }

    cloned.players.forEach(p => {
      if (p.id !== forPlayerId) {
        p.cards = [];
      }
    });

    cloned.deck = [];

    return cloned;
  }
}
