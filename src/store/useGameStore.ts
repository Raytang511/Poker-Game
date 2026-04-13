import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { GameStateEngine } from '../game/GameStateEngine';
import { GameState, Action } from '../game/types';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface RoomConfig {
  id: string;
  name: string;
  type: string;
  sb: number;
  bb: number;
}

const AUTO_START_DELAY_MS = 3000; // 3 seconds after showdown to start next hand
const HOST_HEARTBEAT_INTERVAL_MS = 5000;
const HOST_TIMEOUT_MS = 15000;
const ACTION_CHECK_INTERVAL_MS = 2000; // Check for action timeout every 2s

interface StoreState {
  user: { id: string; name: string; chips: number } | null;
  currentRoom: RoomConfig | null;
  gameState: GameState | null;
  engine: GameStateEngine | null;
  channel: RealtimeChannel | null;
  isHost: boolean;
  
  // Internal timers
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
  
  // Redeem Code logic
  redeemCode: (code: string) => Promise<string>;
}

export const useGameStore = create<StoreState>((set, get) => ({
  user: null,
  currentRoom: null,
  gameState: null,
  engine: null,
  channel: null,
  isHost: false,
  _heartbeatTimer: null,
  _actionTimer: null,
  _autoStartTimer: null,
  _lastHostUpdate: 0,
  _onlinePlayers: new Set(),
  
  initAuth: () => {
     // 防止 React Strict Mode 下重复挂载导致 Supabase 内部死锁 (lock:sb-xxx not released)
     if ((window as any)._authInitialized) return;
     (window as any)._authInitialized = true;

     // 监听实际的 Supabase Auth 状态
     supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
           try {
              // 获取数据库 Profile 中的 chips
              const { data, error } = await supabase.from('profiles').select('username, chips').eq('id', session.user.id).single();
              if (error) console.error("Profile load issue:", error);
              
              set({ 
                user: { 
                  id: session.user.id, 
                  name: data?.username || session.user.email?.split('@')[0] || 'Player', 
                  chips: data?.chips || 1000 
                } 
              });
           } catch(err) {
              console.error("Failed to load profile", err);
              // Fallback to allow them into the game even if profiles table is missing
              set({ 
                user: { 
                  id: session.user.id, 
                  name: session.user.email?.split('@')[0] || 'Player', 
                  chips: 1000 
                } 
              });
           }
        } else {
           set({ user: null });
        }
     });
  },

  loginLocalMock: (name) => {
    set({ user: { id: `user_${Math.random().toString(36).substr(2, 9)}`, name, chips: 150000 }});
  },
  
  joinRoom: (room) => {
    const user = get().user;
    if (!user) return;
    
    // 清理之前的定时器
    const prev = get();
    if (prev._heartbeatTimer) clearInterval(prev._heartbeatTimer);
    if (prev._actionTimer) clearInterval(prev._actionTimer);
    if (prev._autoStartTimer) clearTimeout(prev._autoStartTimer);
    if (prev.channel) prev.channel.unsubscribe();
    
    // 初始化时认定自己是 Client，清除过往引擎
    set({ 
      currentRoom: room, gameState: null, engine: null, channel: null, isHost: false,
      _heartbeatTimer: null, _actionTimer: null, _autoStartTimer: null, 
      _lastHostUpdate: 0, _onlinePlayers: new Set([user.id])
    });
    
    const channel = supabase.channel(`room:${room.id}`, {
      config: { broadcast: { self: false, ack: true } }
    });
    
    let isInitialized = false;

    channel
      .on('broadcast', { event: 'gameStateUpdate' }, ({ payload }) => {
         const me = get().user;
         isInitialized = true;
         set({ _lastHostUpdate: Date.now() });
         
         // 解决脑裂：如果两个玩家互相都以为自己是 Host，ID 字母顺序小的自动退位
         if (get().isHost && payload.hostId !== me?.id) {
             if (payload.hostId < (me?.id || "")) {
                 console.log("退位让给:", payload.hostId);
                 // 清理 Host 的定时器
                 const at = get()._actionTimer;
                 if (at) clearInterval(at);
                 set({ isHost: false, engine: null, _actionTimer: null });
             } else {
                 // 我的 ID 更小，我继续当 Host
                 broadcastState();
                 return;
             }
         }
         
         // Client 端：收到的 state 已经由 Host 过滤了手牌
         set({ gameState: payload.gameState });
         
         // Client 端检查是否需要 auto-start
         checkAutoStart(payload.gameState);
      })
      .on('broadcast', { event: 'PLAYER_JOIN' }, ({ payload }) => {
         const { isHost, engine, user: me } = get();
         if (isHost && engine) {
            // 自动为新加入的玩家分配一个空座
            const state = engine.getState();
            const used = state.players.map((p: any) => p.seat);
            const seat = [0,1,2,3,4,5,6,7].find(s => !used.includes(s));
            if (seat !== undefined && !state.players.find((p:any) => p.id === payload.player.id)) {
               try {
                   engine.addPlayer({ ...payload.player, seat });
                   broadcastStateToAll();
               } catch (e) { console.error(e) }
            }
            
            // 如果当前在 waiting 状态且有足够玩家，自动开始
            const newState = engine.getState();
            if (newState.phase === 'waiting' && newState.players.filter(p => p.chips > 0).length >= 2) {
              scheduleAutoStart();
            }
         }
         
         // Track online players
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
            } catch (e) { console.error(e) }
         }
      })
      .on('broadcast', { event: 'REJOIN' }, ({ payload }) => {
         // Host 收到重连请求，发送当前状态
         const { isHost, engine } = get();
         if (isHost && engine) {
            broadcastStateToAll();
         }
      })
      .on('broadcast', { event: 'HOST_HEARTBEAT' }, ({ payload }) => {
         set({ _lastHostUpdate: Date.now() });
      })
      .on('broadcast', { event: 'HOST_START_HAND' }, () => {
         // Host 广播开新一手，对 Client 无直接作用（state 会通过 gameStateUpdate 同步）
      })
      .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
            console.log("已通过 Supabase 连接到 Realtime 大厅:", room.id);
            // 广播我加入的请求
            channel.send({ type: 'broadcast', event: 'PLAYER_JOIN', payload: { player: { id: user.id, name: user.name, chips: user.chips } } });
            
            // 如果 1.5 秒内没有收到权威的 state，我就宣誓成为 Host
            setTimeout(() => {
               if (!isInitialized) {
                  console.log("房间空无一人，我晋升为房主 (Host)。");
                  becomeHost(room, user);
               }
            }, 1500);
            
            // 启动心跳检测 (Client 端检查 Host 是否在线)
            const heartbeatTimer = setInterval(() => {
               const { isHost, _lastHostUpdate, channel: ch } = get();
               
               if (isHost && ch) {
                  // Host 发送心跳
                  ch.send({ type: 'broadcast', event: 'HOST_HEARTBEAT', payload: { hostId: user.id, timestamp: Date.now() } });
               } else if (!isHost && _lastHostUpdate > 0) {
                  // Client 检查 Host 超时
                  if (Date.now() - _lastHostUpdate > HOST_TIMEOUT_MS) {
                     console.log("Host 似乎掉线了，尝试接管...");
                     attemptHostTakeover(room);
                  }
               }
            }, HOST_HEARTBEAT_INTERVAL_MS);
            
            set({ _heartbeatTimer: heartbeatTimer });
         }
      });
    
    set({ channel });
    
    // --- Helper functions ---
    
    function broadcastState() {
      const { engine, user: me, channel: ch } = get();
      if (!engine || !me || !ch) return;
      ch.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: engine.getSanitizedStateFor(me.id), hostId: me.id }});
    }
    
    function broadcastStateToAll() {
      const { engine, user: me, channel: ch } = get();
      if (!engine || !me || !ch) return;
      
      // 广播一个"通用"版本（隐藏所有人手牌 —— 每个客户端只能看到自己的牌通过后续机制）
      // 简化方案：Host 广播时按 Host 自己的视角过滤一次
      // 然后给每个其他玩家单独发一次他们自己的牌
      const state = engine.getState();
      
      // 主广播：不包含任何人的手牌（除非 showdown）
      const sanitizedForBroadcast = engine.getSanitizedStateFor('__nobody__');
      ch.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: sanitizedForBroadcast, hostId: me.id }});
      
      // Host 本地直接用完整的自己视角的状态
      const myState = engine.getSanitizedStateFor(me.id);
      set({ gameState: myState });
      
      // 给每个非 Host 的玩家发送他们各自的手牌
      state.players.forEach(p => {
        if (p.id !== me.id && p.cards.length > 0 && state.phase !== 'showdown') {
          ch.send({ type: 'broadcast', event: 'PRIVATE_CARDS', payload: { playerId: p.id, cards: p.cards }});
        }
      });
    }
    
    // 监听私人手牌事件（Client 端）
    channel.on('broadcast', { event: 'PRIVATE_CARDS' }, ({ payload }) => {
      const me = get().user;
      if (!me || payload.playerId !== me.id) return;
      
      // 将我的手牌合并到本地 gameState 中
      const gs = get().gameState;
      if (!gs) return;
      const updated = JSON.parse(JSON.stringify(gs)) as GameState;
      const myPlayer = updated.players.find(p => p.id === me.id);
      if (myPlayer) {
        myPlayer.cards = payload.cards;
        set({ gameState: updated });
      }
    });
    
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
          // 只在 waiting 或 showdown 才开始新手
          if (currentState.phase === 'waiting' || currentState.phase === 'showdown') {
            engine.startNewHand();
            broadcastStateToAll();
          }
        }
      }, AUTO_START_DELAY_MS);
      
      set({ _autoStartTimer: timer });
    }
    
    function becomeHost(room: RoomConfig, user: { id: string; name: string; chips: number }) {
      const engine = new GameStateEngine(undefined, room.sb, room.bb);
      engine.addPlayer({ id: user.id, name: user.name, chips: user.chips, seat: 0 });
      
      // 启动行动计时器检查
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
      
      set({ isHost: true, engine, gameState: engine.getState(), _actionTimer: actionTimer });
      broadcastStateToAll();
    }
    
    function attemptHostTakeover(room: RoomConfig) {
      const { user: me, gameState: lastState, isHost } = get();
      if (!me || isHost) return;
      
      // 简单策略：直接尝试成为新 Host
      console.log("我尝试成为新的 Host");
      
      // 从最后已知的 gameState 重建引擎
      let engine: GameStateEngine;
      if (lastState) {
        engine = new GameStateEngine(JSON.parse(JSON.stringify(lastState)), room.sb, room.bb);
      } else {
        engine = new GameStateEngine(undefined, room.sb, room.bb);
        engine.addPlayer({ id: me.id, name: me.name, chips: me.chips, seat: 0 });
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
      
      set({ isHost: true, engine, gameState: engine.getState(), _actionTimer: actionTimer, _lastHostUpdate: Date.now() });
      broadcastStateToAll();
    }
  },
  
  leaveRoom: () => {
    const { channel, user, _heartbeatTimer, _actionTimer, _autoStartTimer } = get();
    
    // 通知其他人我离开了
    if (channel && user) {
      channel.send({ type: 'broadcast', event: 'PLAYER_LEAVE', payload: { playerId: user.id } });
    }
    
    if (channel) channel.unsubscribe();
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    if (_actionTimer) clearInterval(_actionTimer);
    if (_autoStartTimer) clearTimeout(_autoStartTimer);
    
    set({ 
      currentRoom: null, engine: null, gameState: null, channel: null, isHost: false,
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
         
         // 广播给所有人
         const state = engine.getState();
         const sanitizedForBroadcast = engine.getSanitizedStateFor('__nobody__');
         channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: sanitizedForBroadcast, hostId: user.id }});
         
         // Host 自己的视角
         set({ gameState: engine.getSanitizedStateFor(user.id) });
         
         // 发送私人手牌
         state.players.forEach(p => {
           if (p.id !== user.id && p.cards.length > 0 && state.phase !== 'showdown') {
             channel.send({ type: 'broadcast', event: 'PRIVATE_CARDS', payload: { playerId: p.id, cards: p.cards }});
           }
         });
         
         // 检查是否需要自动开始下一局
         if (newState.phase === 'showdown' || newState.phase === 'waiting') {
           const prevTimer = get()._autoStartTimer;
           if (prevTimer) clearTimeout(prevTimer);
           const timer = setTimeout(() => {
             const { isHost: h, engine: eng, channel: ch, user: me } = get();
             if (h && eng && ch && me) {
               const cs = eng.getState();
               if (cs.phase === 'waiting' || cs.phase === 'showdown') {
                 eng.startNewHand();
                 // broadcast again
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
       } catch(e: any) { alert(e.message); }
    } else {
       // 我是房客，把我的操作意愿发给房主代为运算
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

  redeemCode: async (code: string) => {
     const user = get().user;
     if (!user) throw new Error("Please login first");
     if (!code) throw new Error("Empty code");

     // 这里在真实业务中应该调用一个 Supabase Postgres RPC 以保证事务安全
     // 比如： `select redeem_gm_code('user_id', 'CODE123')`
     // 以下为直接操作逻辑，如果配置了 RLS 会失败，需在服务器端执行。
     
     const { data: codeData, error: findErr } = await supabase
        .from('redeem_codes')
        .select('*')
        .eq('code', code)
        .single();
        
     if (findErr || !codeData) throw new Error("兑换码无效或不存在");
     if (codeData.is_used) throw new Error("该兑换码已被使用");

     // Update order
     await supabase.from('redeem_codes').update({ is_used: true, used_by: user.id, used_at: new Date() }).eq('id', codeData.id);
     await supabase.from('profiles').update({ chips: user.chips + codeData.amount }).eq('id', user.id);
     
     set({ user: { ...user, chips: user.chips + codeData.amount }});
     return `兑换成功！获得了 ${codeData.amount} 筹码。`;
  }
}));
