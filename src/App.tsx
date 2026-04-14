import React, { useEffect, useState } from 'react';
import { useGameStore } from './store/useGameStore';
import Lobby from './components/Lobby';
import PokerTable from './components/PokerTable';
import RedeemModal from './components/RedeemModal';

function App() {
  const { currentRoom, user, initAuth, leaveRoom } = useGameStore();
  const [showRedeem, setShowRedeem] = useState(false);

  // 顶层初始化 Auth，确保无论哪个页面都能捕获 Supabase session
  useEffect(() => {
    initAuth();
    return () => {
      // StrictMode 下会 unmount→remount；清理旧 listener 以防双注册
      const sub = (window as any)._authSubscription;
      if (sub) {
        sub.unsubscribe();
        (window as any)._authSubscription = null;
      }
      (window as any)._authInitialized = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full min-h-screen bg-gray-900 text-slate-100 font-sans flex flex-col">

      {/* ── 顶栏 ── */}
      <header className="h-14 border-b border-white/5 bg-black/20 flex items-center justify-between px-5 z-50 flex-shrink-0">
        {/* 品牌 */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-poker-green to-emerald-400 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <span className="text-black font-bold text-lg">♠</span>
          </div>
          <h1 className="text-xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
            HOLD'EM
          </h1>
          {currentRoom && (
            <span className="text-gray-600 text-xs hidden sm:inline">
              · {currentRoom.name}
            </span>
          )}
        </div>

        {/* 右侧操作区 */}
        {user && (
          <div className="flex items-center gap-2">
            {/* 积分兑换按钮 */}
            {!currentRoom && (
              <button
                onClick={() => setShowRedeem(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-400 hover:text-emerald-300 border border-white/[0.07] hover:border-emerald-500/40 bg-white/[0.03] hover:bg-emerald-500/10 transition-all uppercase tracking-wider"
              >
                积分兑换
              </button>
            )}

            {/* 用户信息 */}
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <span className="text-slate-300 text-sm hidden sm:inline">{user.name}</span>
              <div className="flex items-center gap-1 px-2 py-0.5 bg-black/40 rounded-full">
                <span className="text-poker-gold text-xs">💰</span>
                <span className="text-poker-gold font-mono text-xs tracking-wider">
                  {user.chips.toLocaleString()}
                </span>
              </div>
              {currentRoom && (
                <button
                  onClick={leaveRoom}
                  className="text-xs text-red-400/80 hover:text-red-300 uppercase tracking-widest ml-1 transition-colors"
                >
                  离开
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── 主内容 ── */}
      <main className="flex-1 relative overflow-hidden flex items-center justify-center">
        {currentRoom ? <PokerTable /> : <Lobby />}
      </main>

      {/* ── 积分兑换弹窗 ── */}
      {showRedeem && <RedeemModal onClose={() => setShowRedeem(false)} />}
    </div>
  );
}

export default App;
