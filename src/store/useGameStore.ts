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

interface StoreState {
  user: { id: string; name: string; chips: number } | null;
  currentRoom: RoomConfig | null;
  gameState: GameState | null;
  engine: GameStateEngine | null;
  channel: RealtimeChannel | null;
  isHost: boolean;
  
  initAuth: () => void;
  loginLocalMock: (name: string) => void;
  joinRoom: (room: RoomConfig) => void;
  leaveRoom: () => void;
  performAction: (action: Action, amount?: number) => void;
  
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
  
  initAuth: () => {
     // 监听实际的 Supabase Auth 状态
     supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
           // 获取数据库 Profile 中的 chips
           const { data } = await supabase.from('profiles').select('username, chips').eq('id', session.user.id).single();
           set({ 
             user: { 
               id: session.user.id, 
               name: data?.username || 'Player', 
               chips: data?.chips || 0 
             } 
           });
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
    
    // 初始化时认定自己是 Client，清除过往引擎
    set({ currentRoom: room, gameState: null, engine: null, channel: null, isHost: false });
    
    const channel = supabase.channel(`room:${room.id}`, {
      config: { broadcast: { self: false, ack: true } }
    });
    
    let isInitialized = false;

    channel
      .on('broadcast', { event: 'gameStateUpdate' }, ({ payload }) => {
         const me = get().user;
         isInitialized = true;
         // 解决脑裂：如果两个玩家互相都以为自己是 Host，ID 字母顺序小的自动退位
         if (get().isHost && payload.hostId !== me?.id) {
             if (payload.hostId < (me?.id || "")) {
                 console.log("退位让给:", payload.hostId);
                 set({ isHost: false, engine: null });
             } else {
                 channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: get().engine?.getState(), hostId: me?.id }});
                 return;
             }
         }
         set({ gameState: payload.gameState });
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
                   channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: engine.getState(), hostId: me?.id }});
               } catch (e) { console.error(e) }
            }
         }
      })
      .on('broadcast', { event: 'ACTION_INTENT' }, ({ payload }) => {
         const { isHost, engine, user: me } = get();
         if (isHost && engine) {
            try {
               engine.processAction(payload.userId, payload.action, payload.amount);
               channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: engine.getState(), hostId: me?.id }});
            } catch (e) { console.error(e) }
         }
      })
      .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
            console.log("已通过 Supabase 连接到 Realtime 大厅:", room.id);
            // 广播我加入的请求
            channel.send({ type: 'broadcast', event: 'PLAYER_JOIN', payload: { player: { id: user.id, name: user.name, chips: user.chips } } });
            
            // 如果 1.5 秒内没有收到权威的 state，我就宣誓成为 Host，由我来发牌！
            setTimeout(() => {
               if (!isInitialized) {
                  console.log("房间空无一人，我晋升为房主 (Host)。");
                  const engine = new GameStateEngine(undefined, room.sb, room.bb);
                  engine.addPlayer({ id: user.id, name: user.name, chips: user.chips, seat: 0 });
                  try { engine.startNewHand(); } catch (e) {}
                  set({ isHost: true, engine, gameState: engine.getState() });
                  channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: engine.getState(), hostId: user.id }});
               }
            }, 1500);
         }
      });
    
    set({ channel });
  },
  
  leaveRoom: () => {
    const channel = get().channel;
    if (channel) channel.unsubscribe();
    set({ currentRoom: null, engine: null, gameState: null, channel: null, isHost: false });
  },
  
  performAction: (action, amount) => {
    const { engine, user, channel, isHost } = get();
    if (!user || !channel) return;
    
    if (isHost && engine) {
       try {
         engine.processAction(user.id, action, amount);
         const newState = { ...engine.getState() };
         set({ gameState: newState });
         channel.send({ type: 'broadcast', event: 'gameStateUpdate', payload: { gameState: newState, hostId: user.id } });
       } catch(e: any) { alert(e.message); }
    } else {
       // 我是房客，把我的操作意愿发给房主代为运算
       channel.send({ type: 'broadcast', event: 'ACTION_INTENT', payload: { userId: user.id, action, amount }});
    }
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
