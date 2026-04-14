import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { GameStateEngine } from '../game/GameStateEngine';
import { GameState, Action, RoomMode } from '../game/types';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface RoomConfig {
  id: string;
  name: string;
  type: string;
  sb: number;
  bb: number;
  mode: RoomMode;           // casual | competitive | unlimited
  startingChips: number;    // 初始筹码量
  password?: string;        // 房间密码
}

const AUTO_START_DELAY_MS = 3000;
const HOST_HEARTBEAT_INTERVAL_MS = 5000;
const HOST_TIMEOUT_MS = 15000;
const ACTION_CHECK_INTERVAL_MS = 2000;
// 同步修复：加大超时前等待时间，避免两人都抢着成为 Host
const BECOME_HOST_INITIAL_WAIT_MS = 2500; // 第一次等待
const BECOME_HOST_RETRY_WAIT_MS = 1500;   // 发出 REJOIN 后再等

interface StoreState {
  user: { id: string; name: string; chips: number } | null;
  currentRoom: RoomConfig | null;
  gameState: GameState | null;
  engine: GameStateEngine | null;
  channel: RealtimeChannel | null;
  globalLobbyChannel: RealtimeChannel | null;
  isHost: boolean;

  _heartbeatTimer: ReturnType<typeof setInterval> | null;
  _actionTimer: ReturnType<typeof setInterval> | null;
  _autoStartTimer: ReturnType<typeof setTimeout> | null;
  _lastHostUpdate: number;
  _onlinePlayers: Set<string>;

  initAuth: () => void;
  loginLocalMock: (name: string) => void;
  joinRoom: (room: RoomConfig) => void;
  leaveRoom: () => void;
  performAction: (action: Action, amount?: number) => void;
  startNewHand: () => void;
  forceEndGame: () => void;
  buyIn: () => void;

  redeemCode: (code: string) => Promise<string>;
}

export const useGameStore = create<StoreState>((set, get) => ({
  user: null,
  currentRoom: null,
  gameState: null,
  engine: null,
  channel: null,
  globalLobbyChannel: null,
  isHost: false,
  _heartbeatTimer: null,
  _actionTimer: null,
  _autoStartTimer: null,
  _lastHostUpdate: 0,
  _onlinePlayers: new Set(),

  initAuth: () => {
     if ((window as any)._authInitialized) return;
     (window as any)._authInitialized = true;

     // ── 辅助函数：从 session 加载用户 profile ──
     async function loadUserFromSession(session: any) {
       if (!session?.user) {
         useGameStore.setState({ user: null });
         return;
       }
       try {
         const { data, error } = await supabase.from('profiles').select('username, chips').eq('id', session.user.id).single();
         if (error) console.error("[Auth] Profile load issue:", error);

         useGameStore.setState({
           user: {
             id: session.user.id,
             name: data?.username || session.user.email?.split('@')[0] || 'Player',
             chips: data?.chips || 1000
           }
         });
       } catch(err) {
         console.error("[Auth] Failed to load profile", err);
         useGameStore.setState({
           user: {
             id: session.user.id,
             name: session.user.email?.split('@')[0] || 'Player',
             chips: 1000
           }
         });
       }
     }

     // ── 1. 主动获取当前 session（不依赖事件） ──
     // 这是最可靠的方式：如果 localStorage 中有有效 session，直接恢复
     supabase.auth.getSession().then(({ data: { session }, error }) => {
       if (error) {
         console.error("[Auth] getSession failed, forcing reset:", error);
         // session 损坏，强制清除并从干净状态开始
         supabase.auth.signOut().catch(() => {});
         useGameStore.setState({ user: null });
         return;
       }
       if (session) {
         console.log("[Auth] 已恢复 session:", session.user.id);
         loadUserFromSession(session);
       } else {
         console.log("[Auth] 无活跃 session，等待用户登录");
         useGameStore.setState({ user: null });
       }
     }).catch(err => {
       console.error("[Auth] getSession 异常:", err);
       useGameStore.setState({ user: null });
     });

     // ── 2. 监听后续 auth 状态变化（登录/登出/token 刷新） ──
     const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
       console.log("[Auth] 状态变化:", event);
       if (event === 'SIGNED_OUT') {
         useGameStore.setState({ user: null });
         return;
       }
       if (session?.user) {
         await loadUserFromSession(session);
       }
     });

     // 保存 unsubscribe 引用，以备需要清理
     (window as any)._authSubscription = subscription;
  },

  loginLocalMock: (name) => {
    set({ user: { id: `user_${Math.random().toString(36).substr(2, 9)}`, name, chips: 5000 }});
  },

  joinRoom: (room) => {
    const user = get().user;
    if (!user) return;

    const prev = get();
    if (prev._heartbeatTimer) clearInterval(prev._heartbeatTimer);
    if (prev._actionTimer) clearInterval(prev._actionTimer);
    if (prev._autoStartTimer) clearTimeout(prev._autoStartTimer);
    if (prev.channel) prev.channel.unsubscribe();

    set({
      currentRoom: room, gameState: null, engine: null, channel: null, globalLobbyChannel: null, isHost: false,
      _heartbeatTimer: null, _actionTimer: null, _autoStartTimer: null,
      _lastHostUpdate: 0, _onlinePlayers: new Set([user.id])
    });

    const channel = supabase.channel(`room:${room.id}`, {
      config: { broadcast: { self: false, ack: true } }
    });

    let isInitialized = false;

    // ── 广播辅助函数 ──────────────────────────────────────
    function broadcastState() {
      const { engine, user: me, channel: ch } = get();
      if (!engine || !me || !ch) return;
      ch.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: engine.getSanitizedStateFor(me.id), hostId: me.id }});
    }

    function broadcastStateToAll() {
      const { engine, user: me, channel: ch } = get();
      if (!engine || !me || !ch) return;

      const state = engine.getState();

      // 发送去除手牌的通用状态给所有人
      const sanitizedForBroadcast = engine.getSanitizedStateFor('__nobody__');
      ch.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: sanitizedForBroadcast, hostId: me.id }});

      // Host 本地直接使用自己视角的状态
      const myState = engine.getSanitizedStateFor(me.id);
      set({ gameState: myState });

      // 给每个非 Host 玩家发送私人手牌
      state.players.forEach(p => {
        if (p.id !== me.id && p.cards.length > 0 && state.phase !== 'showdown') {
          ch.send({ type: 'broadcast', event: 'PRIVATE_CARDS', payload: { playerId: p.id, cards: p.cards }});
        }
      });
    }

    function checkAutoStart(state: GameState) {
      if (state.phase === 'showdown') {
        scheduleAutoStart();
      }
    }

    function scheduleAutoStart() {
      const prev = get()._autoStartTimer;
      if (prev) clearTimeout(prev);

      const timer = setTimeout(() => {
        const { isHost, engine, channel: ch, user: me } = get();
        if (isHost && engine && ch && me) {
          const currentState = engine.getState();
          if (currentState.phase === 'waiting' || currentState.phase === 'showdown') {
            if (!currentState.gameEnded) {
              engine.startNewHand();
              broadcastStateToAll();
            }
          }
        }
      }, AUTO_START_DELAY_MS);

      set({ _autoStartTimer: timer });
    }

    function becomeHost(room: RoomConfig, user: { id: string; name: string; chips: number }) {
      const engine = new GameStateEngine(undefined, room.sb, room.bb, room.mode, room.startingChips);
      engine.addPlayer({ id: user.id, name: user.name, chips: room.startingChips || user.chips, seat: 0 });

      const actionTimer = setInterval(() => {
        const { isHost, engine: eng } = get();
        if (isHost && eng) {
          const timedOut = eng.checkTimeout();
          if (timedOut) {
            broadcastStateToAll();
            checkAutoStart(eng.getState());
          }
        }
      }, ACTION_CHECK_INTERVAL_MS);
      
      let lobbyCh = null;
      if (room.type === 'custom') {
        lobbyCh = supabase.channel('poker_lobby');
        lobbyCh.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await lobbyCh!.track({ type: 'host_room', room });
          }
        });
      }

      set({ isHost: true, engine, gameState: engine.getState(), _actionTimer: actionTimer, globalLobbyChannel: lobbyCh });
      broadcastStateToAll();
    }

    function attemptHostTakeover(room: RoomConfig) {
      const { user: me, gameState: lastState, isHost } = get();
      if (!me || isHost) return;

      console.log("Host 超时，尝试接管...");

      let engine: GameStateEngine;
      if (lastState) {
        engine = new GameStateEngine(JSON.parse(JSON.stringify(lastState)), room.sb, room.bb);
      } else {
        engine = new GameStateEngine(undefined, room.sb, room.bb, room.mode, room.startingChips);
        engine.addPlayer({ id: me.id, name: me.name, chips: room.startingChips || me.chips, seat: 0 });
      }

      const actionTimer = setInterval(() => {
        const { isHost: h, engine: eng } = get();
        if (h && eng) {
          const timedOut = eng.checkTimeout();
          if (timedOut) {
            broadcastStateToAll();
            checkAutoStart(eng.getState());
          }
        }
      }, ACTION_CHECK_INTERVAL_MS);
      
      let lobbyCh = null;
      if (room.type === 'custom') {
        lobbyCh = supabase.channel('poker_lobby');
        lobbyCh.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await lobbyCh!.track({ type: 'host_room', room });
          }
        });
      }

      set({ isHost: true, engine, gameState: engine.getState(), _actionTimer: actionTimer, _lastHostUpdate: Date.now(), globalLobbyChannel: lobbyCh });
      broadcastStateToAll();
    }

    // ── 频道事件处理 ──────────────────────────────────────
    channel
      .on('broadcast', { event: 'gameStateUpdate' }, ({ payload }) => {
         const me = get().user;
         isInitialized = true;
         set({ _lastHostUpdate: Date.now() });

         // 脑裂检测：ID 字母序小的为权威 Host
         if (get().isHost && payload.hostId !== me?.id) {
             if (payload.hostId < (me?.id || "")) {
                 console.log("退位让给:", payload.hostId);
                 const at = get()._actionTimer;
                 const gLobby = get().globalLobbyChannel;
                 if (at) clearInterval(at);
                 if (gLobby) {
                   gLobby.untrack();
                   gLobby.unsubscribe();
                 }
                 set({ isHost: false, engine: null, _actionTimer: null, globalLobbyChannel: null });
             } else {
                 // 我的 ID 更小，我是权威 Host，重新广播覆盖对方的状态
                 broadcastState();
                 return;
             }
         }

         set({ gameState: payload.gameState });
         checkAutoStart(payload.gameState);
      })
      .on('broadcast', { event: 'PLAYER_JOIN' }, ({ payload }) => {
         const { isHost, engine, user: me } = get();
         if (isHost && engine) {
            const state = engine.getState();
            const used = state.players.map((p: any) => p.seat);
            const seat = [0,1,2,3,4,5,6,7].find(s => !used.includes(s));
            if (seat !== undefined && !state.players.find((p:any) => p.id === payload.player.id)) {
               try {
                   // 竞技/无限注模式用房间设定筹码，而非玩家自身筹码
                   const joinChips = (get().currentRoom?.startingChips) || payload.player.chips;
                   engine.addPlayer({ ...payload.player, chips: joinChips, seat });
                   broadcastStateToAll();
                   // 延迟再广播一次，应对消息丢失
                   setTimeout(() => broadcastStateToAll(), 600);
               } catch (e) { console.error(e) }
            } else {
               // 已在房间，刷新状态
               broadcastStateToAll();
            }

            const newState = engine.getState();
            if (newState.phase === 'waiting' && newState.players.filter(p => p.chips > 0).length >= 2) {
              scheduleAutoStart();
            }
         }

         const onlinePlayers = new Set(get()._onlinePlayers);
         onlinePlayers.add(payload.player.id);
         set({ _onlinePlayers: onlinePlayers });
      })
      .on('broadcast', { event: 'PLAYER_LEAVE' }, ({ payload }) => {
         const { isHost, engine } = get();
         if (isHost && engine) {
            try {
               engine.removePlayer(payload.playerId);
               broadcastStateToAll();
            } catch (e) { console.error(e) }
         }

         const onlinePlayers = new Set(get()._onlinePlayers);
         onlinePlayers.delete(payload.playerId);
         set({ _onlinePlayers: onlinePlayers });
      })
      .on('broadcast', { event: 'ACTION_INTENT' }, ({ payload }) => {
         const { isHost, engine } = get();
         if (isHost && engine) {
            try {
               engine.processAction(payload.userId, payload.action, payload.amount);
               const newState = engine.getState();
               broadcastStateToAll();
               checkAutoStart(newState);
            } catch (e) {
               console.error("ACTION_INTENT 处理失败:", e);
               // 即使失败也广播当前状态，修正客户端
               broadcastStateToAll();
            }
         }
      })
      .on('broadcast', { event: 'BUY_IN_INTENT' }, ({ payload }) => {
         const { isHost, engine } = get();
         if (isHost && engine) {
            try {
               engine.buyIn(payload.userId);
               broadcastStateToAll();
            } catch (e) { console.error(e) }
         }
      })
      .on('broadcast', { event: 'FORCE_END_INTENT' }, () => {
         const { isHost, engine } = get();
         if (isHost && engine) {
            engine.forceEndGame();
            broadcastStateToAll();
         }
      })
      .on('broadcast', { event: 'REJOIN' }, ({ payload }) => {
         const { isHost, engine } = get();
         if (isHost && engine) {
            broadcastStateToAll();
         }
      })
      .on('broadcast', { event: 'HOST_HEARTBEAT' }, () => {
         set({ _lastHostUpdate: Date.now() });
      })
      .on('broadcast', { event: 'PRIVATE_CARDS' }, ({ payload }) => {
        const me = get().user;
        if (!me || payload.playerId !== me.id) return;

        const gs = get().gameState;
        if (!gs) return;
        const updated = JSON.parse(JSON.stringify(gs)) as GameState;
        const myPlayer = updated.players.find(p => p.id === me.id);
        if (myPlayer) {
          myPlayer.cards = payload.cards;
          set({ gameState: updated });
        }
      })
      .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
            console.log("已连接到房间:", room.id);
            const joinChips = room.startingChips || user.chips;
            channel.send({
              type: 'broadcast', event: 'PLAYER_JOIN',
              payload: { player: { id: user.id, name: user.name, chips: joinChips } }
            });

            // ── 同步修复：两阶段等待，减少脑裂 ──
            // 第一阶段：等待 2.5s
            const firstTimer = setTimeout(() => {
               if (isInitialized) return;
               console.log("未收到状态，发出重连请求...");
               channel.send({ type: 'broadcast', event: 'REJOIN', payload: { playerId: user.id } });

               // 第二阶段：再等 1.5s，若还是没有，才成为 Host
               setTimeout(() => {
                  if (!isInitialized) {
                     console.log("房间空无一人，晋升为 Host。");
                     becomeHost(room, user);
                  }
               }, BECOME_HOST_RETRY_WAIT_MS);
            }, BECOME_HOST_INITIAL_WAIT_MS);

            // 启动心跳
            const heartbeatTimer = setInterval(() => {
               const { isHost, _lastHostUpdate, channel: ch } = get();

               if (isHost && ch) {
                  ch.send({ type: 'broadcast', event: 'HOST_HEARTBEAT', payload: { hostId: user.id, timestamp: Date.now() } });
               } else if (!isHost && _lastHostUpdate > 0) {
                  if (Date.now() - _lastHostUpdate > HOST_TIMEOUT_MS) {
                     console.log("Host 超时，尝试接管...");
                     attemptHostTakeover(room);
                  }
               }
            }, HOST_HEARTBEAT_INTERVAL_MS);

            set({ _heartbeatTimer: heartbeatTimer });

            // 组件卸载时清理第一阶段定时器
            return () => clearTimeout(firstTimer);
         }
      });

    set({ channel });
  },

  leaveRoom: () => {
    const { channel, globalLobbyChannel, user, _heartbeatTimer, _actionTimer, _autoStartTimer } = get();

    if (channel && user) {
      channel.send({ type: 'broadcast', event: 'PLAYER_LEAVE', payload: { playerId: user.id } });
    }

    if (channel) channel.unsubscribe();
    if (globalLobbyChannel) {
      globalLobbyChannel.untrack();
      globalLobbyChannel.unsubscribe();
    }
    
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    if (_actionTimer) clearInterval(_actionTimer);
    if (_autoStartTimer) clearTimeout(_autoStartTimer);

    set({
      currentRoom: null, engine: null, gameState: null, channel: null, globalLobbyChannel: null, isHost: false,
      _heartbeatTimer: null, _actionTimer: null, _autoStartTimer: null
    });
  },

  performAction: (action, amount) => {
    const { engine, user, channel, isHost } = get();
    if (!user || !channel) return;

    if (isHost && engine) {
       try {
         engine.processAction(user.id, action, amount);
         const newState = engine.getState();

         const state = engine.getState();
         const sanitizedForBroadcast = engine.getSanitizedStateFor('__nobody__');
         channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: sanitizedForBroadcast, hostId: user.id }});

         set({ gameState: engine.getSanitizedStateFor(user.id) });

         state.players.forEach(p => {
           if (p.id !== user.id && p.cards.length > 0 && state.phase !== 'showdown') {
             channel.send({ type: 'broadcast', event: 'PRIVATE_CARDS', payload: { playerId: p.id, cards: p.cards }});
           }
         });

         if (newState.phase === 'showdown' || newState.phase === 'waiting') {
           const prevTimer = get()._autoStartTimer;
           if (prevTimer) clearTimeout(prevTimer);
           const timer = setTimeout(() => {
             const { isHost: h, engine: eng, channel: ch, user: me } = get();
             if (h && eng && ch && me) {
               const cs = eng.getState();
               if ((cs.phase === 'waiting' || cs.phase === 'showdown') && !cs.gameEnded) {
                 eng.startNewHand();
                 const st = eng.getState();
                 const san = eng.getSanitizedStateFor('__nobody__');
                 ch.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: san, hostId: me.id }});
                 set({ gameState: eng.getSanitizedStateFor(me.id) });
                 st.players.forEach(p => {
                   if (p.id !== me.id && p.cards.length > 0 && st.phase !== 'showdown') {
                     ch.send({ type: 'broadcast', event: 'PRIVATE_CARDS', payload: { playerId: p.id, cards: p.cards }});
                   }
                 });
               }
             }
           }, AUTO_START_DELAY_MS);
           set({ _autoStartTimer: timer });
         }
       } catch(e: any) {
          console.error("Action failed:", e);
       }
    } else {
       channel.send({ type: 'broadcast', event: 'ACTION_INTENT', payload: { userId: user.id, action, amount }});
    }
  },

  startNewHand: () => {
    const { isHost, engine, channel, user } = get();
    if (!isHost || !engine || !channel || !user) return;

    engine.startNewHand();
    const state = engine.getState();
    const sanitized = engine.getSanitizedStateFor('__nobody__');
    channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: sanitized, hostId: user.id }});
    set({ gameState: engine.getSanitizedStateFor(user.id) });

    state.players.forEach(p => {
      if (p.id !== user.id && p.cards.length > 0 && state.phase !== 'showdown') {
        channel.send({ type: 'broadcast', event: 'PRIVATE_CARDS', payload: { playerId: p.id, cards: p.cards }});
      }
    });
  },

  forceEndGame: () => {
    const { isHost, engine, channel, user } = get();
    if (!user || !channel) return;

    if (isHost && engine) {
      engine.forceEndGame();
      const state = engine.getState();
      const sanitized = engine.getSanitizedStateFor('__nobody__');
      channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: sanitized, hostId: user.id }});
      set({ gameState: engine.getSanitizedStateFor(user.id) });
    } else {
      channel.send({ type: 'broadcast', event: 'FORCE_END_INTENT', payload: { userId: user.id } });
    }
  },

  buyIn: () => {
    const { isHost, engine, channel, user } = get();
    if (!user || !channel) return;

    if (isHost && engine) {
      try {
        engine.buyIn(user.id);
        const sanitized = engine.getSanitizedStateFor('__nobody__');
        channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: sanitized, hostId: user.id }});
        set({ gameState: engine.getSanitizedStateFor(user.id) });
      } catch(e: any) {
        console.error(e);
      }
    } else {
      channel.send({ type: 'broadcast', event: 'BUY_IN_INTENT', payload: { userId: user.id } });
    }
  },

  redeemCode: async (code: string) => {
     const user = get().user;
     if (!user) throw new Error("Please login first");
     if (!code) throw new Error("Empty code");

     const { data: codeData, error: findErr } = await supabase
        .from('redeem_codes')
        .select('*')
        .eq('code', code)
        .single();

     if (findErr || !codeData) throw new Error("兑换码无效或不存在");
     if (codeData.is_used) throw new Error("该兑换码已被使用");

     await supabase.from('redeem_codes').update({ is_used: true, used_by: user.id, used_at: new Date() }).eq('id', codeData.id);
     await supabase.from('profiles').update({ chips: user.chips + codeData.amount }).eq('id', user.id);

     set({ user: { ...user, chips: user.chips + codeData.amount }});
     return `兑换成功！获得了 ${codeData.amount} 筹码。`;
  }
}));
