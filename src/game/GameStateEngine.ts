import { GameState, Phase, Player, Action, Pot, Card } from './types';
import { generateDeck, shuffle, evaluateHand, compareHands, EvaluatedHand } from './HandEvaluator';

export class GameStateEngine {
  private state: GameState;

  constructor(initialState?: GameState, smallBlind: number = 1, bigBlind: number = 2) {
    if (initialState) {
      this.state = initialState;
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
        lastLogs: []
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
      status: 'waiting' as any, // initial status
      actedRound: false,
      cards: []
    });
    this.log(`玩家 ${player.name} 加入了房间`);
  }

  removePlayer(playerId: string) {
    // 简略版：直接离开；实际中需考虑在游戏中离开变为 fold 等
    this.state.players = this.state.players.filter(p => p.id !== playerId);
    this.log(`玩家 ${playerId} 离开了房间`);
  }

  // --- 2. 游戏核心流程控制 ---
  startNewHand() {
    const activePlayers = this.state.players.filter(p => p.chips > 0 || (p as any).status !== 'waiting');
    if (activePlayers.length < 2) {
      this.log("人数不足，等待更多玩家");
      this.state.phase = 'waiting';
      return;
    }

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
    this.state.phase = 'pre_flop';

    // 移动庄家(Button)
    let dealerFound = false;
    while (!dealerFound) {
      this.state.dealerIndex = (this.state.dealerIndex + 1) % this.state.players.length;
      if (this.state.players[this.state.dealerIndex].status === 'playing') {
        dealerFound = true;
      }
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

  // --- 3. 玩家动作处理 (Action Processor) ---
  processAction(playerId: string, action: Action, amount: number = 0) {
    if (this.state.currentTurn === null) throw new Error("当前不在行动阶段");
    const player = this.state.players[this.state.currentTurn];
    
    if (player.id !== playerId) {
      throw new Error(`当前不轮到 ${playerId} 行动`);
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
      case 'raise':
        if (amount < this.state.bigBlind) throw new Error("加注额不能小于大盲");
        actAmount = Math.min(player.chips, amount);
        this.commitBet(player, actAmount);
        if (player.bet > this.state.currentBet) {
          this.state.currentBet = player.bet;
          // 有人加注后，其他人需要重新行动
          this.state.players.forEach(p => {
             if (p.id !== player.id && p.status === 'playing') p.actedRound = false;
          });
        }
        player.actedRound = true;
        this.log(`${player.name} ${action} ${actAmount}`);
        break;
        
      case 'all_in':
        actAmount = player.chips;
        this.commitBet(player, actAmount);
        if (player.bet > this.state.currentBet) {
          this.state.currentBet = player.bet;
          this.state.players.forEach(p => {
             if (p.id !== player.id && p.status === 'playing') p.actedRound = false;
          });
        }
        player.status = 'all_in';
        player.actedRound = true;
        this.log(`${player.name} 全下 (All-In) 剩余的所有 ${actAmount} 筹码`);
        break;
    }

    this.checkRoundEnd();
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

  private getNextActivePlayerIndex(startIndex: number): number {
    let next = startIndex;
    const len = this.state.players.length;
    for (let i = 0; i < len; i++) {
      next = (next + 1) % len;
      const status = this.state.players[next].status;
      // All_in 的玩家跳过行动阶段，但在找盲注位置时，需要考虑。如果该方法专用于行动回合：
      if (status === 'playing') {
        return next;
      }
    }
    return next; // 理论上如果没有，说明人都Fold了或者All in了
  }

  private countActivePlayers(): number {
    return this.state.players.filter(p => p.status === 'playing' || p.status === 'all_in').length;
  }

  private countCanActPlayers(): number {
    return this.state.players.filter(p => p.status === 'playing').length;
  }

  private checkRoundEnd() {
    const active = this.countActivePlayers();
    
    // 情况1：所有人弃牌，只剩1人（无论ta是不是all in）
    if (active === 1) {
      this.handleEarlyWin();
      return;
    }

    // 检查此轮是否所有需行动玩家都已完成行动（且跟平了 currentBet）
    const needToAct = this.state.players.filter(p => p.status === 'playing' && (!p.actedRound || p.bet < this.state.currentBet));

    if (needToAct.length === 0) {
      // 本轮结束，收集筹码入池
      this.collectPots();

      // 如果只有一个剩余玩家可以行动，且其他人全部 All_in，那也没有后续行动回合了
      // 应该直接发完剩下的牌进入 showdown
      if (this.countCanActPlayers() <= 1) {
        this.autoDealToRiver();
        return;
      }

      this.advancePhase();
    } else {
      // 继续下一人的回合
      this.state.currentTurn = this.getNextActivePlayerIndex(this.state.currentTurn!);
    }
  }

  private collectPots() {
    // 处理边池 (Side pots) - 按照所有涉及到的下注金额分割
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
        // 合并到最近有相同 eligibleIds 的边池中，或者新建
        if (this.state.pots.length > 0) {
          const lastPot = this.state.pots[this.state.pots.length - 1];
          // 如果符合条件的人相同，说明没有引入新的 all_in 条件切分，直接累加
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

    // 重置本轮下注
    this.state.players.forEach(p => {
      p.actedRound = false;
      p.bet = 0;
    });
    this.state.currentBet = 0;
  }

  private advancePhase() {
    switch (this.state.phase) {
      case 'pre_flop':
        this.dealBoardContext(3);
        this.state.phase = 'flop';
        this.log(`发翻牌 (Flop): ${this.getBoardString(0,3)}`);
        break;
      case 'flop':
        this.dealBoardContext(1);
        this.state.phase = 'turn';
        this.log(`发转牌 (Turn): ${this.getBoardString(3,4)}`);
        break;
      case 'turn':
        this.dealBoardContext(1);
        this.state.phase = 'river';
        this.log(`发河牌 (River): ${this.getBoardString(4,5)}`);
        break;
      case 'river':
        this.state.phase = 'showdown';
        this.handleShowdown();
        return; // handleShowdown 结束一局
    }
    
    // 每轮开始前，优先由小盲位发起 (或者小盲顺延)
    this.state.currentTurn = this.getNextActivePlayerIndex(this.state.dealerIndex);
  }

  private autoDealToRiver() {
    this.log("大部分玩家已全下，自动发底牌...");
    while (this.state.phase !== 'river' && this.state.phase !== 'showdown') {
      this.advancePhase();
    }
    if (this.state.phase === 'river') {
      this.state.phase = 'showdown';
      this.handleShowdown();
    }
  }

  private dealBoardContext(count: number) {
    for (let i = 0; i < count; i++) {
        this.state.board.push(this.state.deck.pop()!);
    }
  }

  private getBoardString(start: number, end: number) {
    return this.state.board.slice(start, end).map(c => `${c.rank}${c.suit.charAt(0)}`).join(', ');
  }

  private handleEarlyWin() {
    const winner = this.state.players.find(p => p.status !== 'folded')!;
    let totalWin = 0;
    
    this.state.players.forEach(p => {
      totalWin += p.bet;
      p.bet = 0;
    });
    this.state.pots.forEach(pot => totalWin += pot.amount);

    winner.chips += totalWin;
    this.log(`${winner.name} 赢得了 ${totalWin} (其他人弃牌)`);
    this.state.phase = 'waiting';
    this.state.currentTurn = null;
  }

  // --- 4. 结算比牌 (Showdown & Evaluate) ---
  private handleShowdown() {
    this.log("进入摊牌结算阶段 (Showdown)!");
    
    // 解析所有活着的玩家卡牌并排序评分
    const playerResults: { p: Player; evalHand: EvaluatedHand }[] = [];
    
    this.state.players.forEach(p => {
      if (p.status !== 'folded') {
        const h = evaluateHand([...p.cards, ...this.state.board]);
        playerResults.push({ p, evalHand: h });
      }
    });

    // 针对每个边池依次进行结算
    // 从最近的底池(最小的 eligible 人数) 结算到 最早的底池(最大的 eligible 人数)？ 
    // 应该从最早产生的池结算，这里循环 pots 即可。
    for (let i = 0; i < this.state.pots.length; i++) {
      const pot = this.state.pots[i];
      if (pot.amount === 0) continue;

      // 寻参与此边池对决的玩家
      const eligibleResults = playerResults.filter(pr => pot.eligiblePlayers.includes(pr.p.id));
      if (eligibleResults.length === 0) continue;

      // 选出最大者
      eligibleResults.sort((a, b) => compareHands(b.evalHand, a.evalHand));
      
      const winners = [eligibleResults[0]];
      for (let j = 1; j < eligibleResults.length; j++) {
        if (compareHands(winners[0].evalHand, eligibleResults[j].evalHand) === 0) {
          winners.push(eligibleResults[j]);
        } else {
          break; // 由于降序排的，后面的一定更小
        }
      }

      // 平分底池
      const winAmount = Math.floor(pot.amount / winners.length);
      winners.forEach(w => {
        w.p.chips += winAmount;
        this.log(`${w.p.name} 赢得了底池 ${winAmount} (牌型等级: ${w.evalHand.rank})`);
      });

      pot.amount = 0;
    }

    this.state.phase = 'waiting';
    this.state.currentTurn = null;
  }

}
