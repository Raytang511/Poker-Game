import React, { useState } from 'react';
import { useGameStore, RoomConfig } from '../store/useGameStore';
import AuthWidget from './AuthWidget';

export default function Lobby() {
  const { user, loginLocalMock, joinRoom, redeemCode } = useGameStore();
  const [redeemInput, setRedeemInput] = useState('');

  const rooms: RoomConfig[] = [
    { id: 'r1', name: '新手桌', type: 'beginner', sb: 1, bb: 2 },
    { id: 'r2', name: '进阶桌', type: 'advanced', sb: 5, bb: 10 },
    { id: 'r3', name: '高手桌', type: 'expert', sb: 20, bb: 50 },
  ];

  if (!user) {
    return <AuthWidget />;
  }

  const handleRedeem = async () => {
    try {
       const msg = await redeemCode(redeemInput);
       alert(msg);
       setRedeemInput('');
    } catch (e: any) {
       alert(e.message);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-4xl p-6 relative z-10">
      
      {/* 兑换码模组 */}
      <div className="flex items-center justify-between mb-8 glass-panel px-6 py-4 rounded-xl">
        <h3 className="text-lg font-medium text-emerald-300">GM Redeem</h3>
        <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Enter Redeem Code..." 
              value={redeemInput} 
              onChange={e => setRedeemInput(e.target.value)}
              className="bg-black/50 border border-white/10 rounded-md px-3 py-1.5 focus:outline-none focus:border-emerald-500 text-sm w-48 text-white" 
            />
            <button 
              onClick={handleRedeem}
              className="bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 rounded-md text-sm font-semibold transition-colors"
            >
              Redeem
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {rooms.map(room => (
           <div key={room.id} className="glass-panel p-6 rounded-2xl flex flex-col items-center hover:-translate-y-1 transition-transform border border-white/5 hover:border-emerald-500/50 group cursor-pointer relative overflow-hidden" onClick={() => joinRoom(room)}>
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="w-12 h-12 rounded-full bg-black/40 flex items-center justify-center mb-4 border border-white/5 group-hover:border-emerald-500/50">
                 <span className="text-xl">
                   {room.type === 'beginner' ? '👶' : room.type === 'advanced' ? '🔥' : '👑'}
                 </span>
              </div>

              <h3 className="text-xl font-bold mb-1 group-hover:text-emerald-400 transition-colors">{room.name}</h3>
              <p className="text-slate-400 text-sm mb-6 flex gap-3">
                 <span>SB: ${room.sb}</span>
                 <span>BB: ${room.bb}</span>
              </p>

              <button className="w-full bg-white/10 hover:bg-emerald-600 group-hover:bg-emerald-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors z-10">
                Join Table
              </button>
           </div>
        ))}
      </div>
    </div>
  );
}
