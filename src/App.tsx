import React from 'react';
import { useGameStore } from './store/useGameStore';
import Lobby from './components/Lobby';
import PokerTable from './components/PokerTable';

function App() {
  const currentRoom = useGameStore((state) => state.currentRoom);
  const user = useGameStore((state) => state.user);

  return (
    <div className="w-full min-h-screen bg-gray-900 text-slate-100 font-sans flex flex-col">
      {/* 极简顶栏 */}
      <header className="h-14 border-b border-white/5 bg-black/20 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-poker-green to-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <span className="text-black font-bold text-lg">♠</span>
          </div>
          <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
            HOLD'EM
          </h1>
        </div>
        
        {user && (
          <div className="flex items-center gap-4 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
            <span className="text-slate-300 text-sm">{user.name}</span>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-black/40 rounded-full">
              <span className="text-poker-gold font-bold">💰</span>
              <span className="text-poker-gold font-mono tracking-wider">{user.chips.toLocaleString()}</span>
            </div>
            {currentRoom && (
              <button 
                onClick={() => useGameStore.getState().leaveRoom()}
                className="ml-2 text-xs text-red-400 hover:text-red-300 uppercase tracking-widest"
              >
                Leave
              </button>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 relative overflow-hidden flex items-center justify-center">
        {currentRoom ? <PokerTable /> : <Lobby />}
      </main>
    </div>
  );
}

export default App;
