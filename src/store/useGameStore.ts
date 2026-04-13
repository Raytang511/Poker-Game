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
    
    // 初始化本地引擎实例（以防万一是首个创建房间的 Host）
    const engine = new GameStateEngine(undefined, room.sb, room.bb);
    engine.addPlayer({ id: user.id, name: user.name, chips: 10000, seat: 0 });

    try { engine.startNewHand(); } catch (e) {}
    
    // 初始化 Supabase Realtime 通道
    const channel = supabase.channel(`room:${room.id}`, {
      config: { broadcast: { self: true, ack: true } }
    });
    
    channel
      .on('broadcast', { event: 'gameStateUpdate' }, ({ payload }) => {
         console.log('Received Game State Update', payload);
         // 同步他人的状态
         set({ gameState: payload.gameState });
         // Host 可见，如果我们在真实环境里，我们会替换本地 engine 的状态
      })
      .subscribe((status) => {
         if (status === 'SUBSCRIBED') {
            console.log("已通过 Supabase 连接到 Realtime 大厅:", room.id);
            // 这里如果是真正的去中心化，可以广播自己加入的信息：
            // channel.send({ type: 'broadcast', event: 'playerJoined', payload: { player: user } })
         }
      });
    
    set({ currentRoom: room, engine, channel, gameState: { ...engine.getState() } });
  },
  
  leaveRoom: () => {
    const channel = get().channel;
    if (channel) channel.unsubscribe();
    set({ currentRoom: null, engine: null, gameState: null, channel: null });
  },
  
  performAction: (action, amount) => {
    const { engine, user, channel } = get();
    if (!engine || !user) return;
    
    try {
      // 1. 本地引擎执行动作
      engine.processAction(user.id, action, amount);
      const newState = { ...engine.getState() };
      
      // 2. 更新本地 UI
      set({ gameState: newState });
      
      // 3. 将新的游戏状态广播给同房间其他玩家
      if (channel) {
         channel.send({
            type: 'broadcast',
            event: 'gameStateUpdate',
            payload: { gameState: newState }
         });
      }
      
    } catch (e: any) {
      alert(e.message);
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
