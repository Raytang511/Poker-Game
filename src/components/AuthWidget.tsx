import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/useGameStore';

export default function AuthWidget() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const { user, initAuth } = useGameStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const handleAuth = async () => {
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error, data } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { username: username || email.split('@')[0] } }
        });
        if (error) throw error;
        // In a real app we would insert into the "profiles" table here
        // if not using a Supabase trigger.
        if (data.user) {
            await supabase.from('profiles').insert({
                id: data.user.id,
                username: username || email.split('@')[0],
                chips: 1000 // default starting chips
            });
        }
      }
    } catch (e: any) {
      alert(e.message || 'Auth Error');
    } finally {
      setLoading(false);
    }
  };

  if (user) return null; // Only show if not logged in

  return (
    <div className="flex flex-col items-center p-8 glass-panel rounded-2xl w-96 max-w-[90vw]">
      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-poker-green to-emerald-400 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.5)] mb-6">
        <span className="text-black font-bold text-3xl">♠</span>
      </div>
      <h2 className="text-2xl font-bold mb-6 tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-cyan-300">
        TEXAS HOLD'EM
      </h2>
      
      {!isLogin && (
        <input 
          type="text" 
          placeholder="Display Name" 
          className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white mb-3 focus:border-emerald-500"
          value={username} onChange={(e) => setUsername(e.target.value)}
        />
      )}
      
      <input 
        type="email" 
        placeholder="Email" 
        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white mb-3 focus:border-emerald-500"
        value={email} onChange={(e) => setEmail(e.target.value)}
      />
      <input 
        type="password" 
        placeholder="Password" 
        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white mb-6 focus:border-emerald-500"
        value={password} onChange={(e) => setPassword(e.target.value)}
      />
      
      <button 
        onClick={handleAuth}
        disabled={loading || !email || !password}
        className="w-full bg-gradient-to-r from-emerald-600 to-poker-green hover:from-emerald-500 text-white font-bold py-3 px-4 rounded-lg transition-transform hover:scale-[1.02] disabled:opacity-50"
      >
        {loading ? 'Processing...' : isLogin ? 'LOGIN' : 'SIGN UP'}
      </button>

      <button className="mt-4 text-sm text-gray-400" onClick={() => setIsLogin(!isLogin)}>
         {isLogin ? "Need an account? Sign Up" : "Already have an account? Login"}
      </button>
      
      {/* 临时演示按钮 */}
      <div className="mt-6 pt-4 border-t border-white/10 w-full text-center">
         <p className="text-xs text-gray-500 mb-2">Supabase 未配置时可用本地模拟</p>
         <button onClick={() => useGameStore.getState().loginLocalMock(email || 'Guest')} className="text-emerald-500 text-sm hover:underline">
            使用本地临时账号进入
         </button>
      </div>
    </div>
  );
}
