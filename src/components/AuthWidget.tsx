import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/useGameStore';

// 检测 Supabase 是否真正配置好
// 排除：未填写的默认值 / key 中含有明显占位符（NAME、YOUR、xxx 等）
const isSupabaseConfigured = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) return false;
  if (url.includes('your-project')) return false;
  if (key.includes('your-anon-key')) return false;
  // 新格式 sb_publishable_ 检测：key 部分不能含明显占位词
  const keyBody = key.replace(/^sb_publishable_/, '').replace(/^eyJ.*/, '__jwt__');
  const hasPlaceholder = /NAME|YOUR|XXXX|PLACEHOLDER|example/i.test(keyBody);
  if (hasPlaceholder) return false;
  // 最短有效长度：Supabase key 不会短于 20 字符
  return key.length >= 20;
})();

// 带超时的 Promise 包装，防止网络挂起导致 loading 永不结束
function withTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('连接超时，请检查网络或 Supabase 配置')), ms)
    ),
  ]);
}

export default function AuthWidget() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLogin, setIsLogin]   = useState(true);
  const [loading, setLoading]   = useState(false);
  const [authError, setAuthError] = useState('');
  const [guestName, setGuestName] = useState('');

  const handleAuth = async () => {
    if (!isSupabaseConfigured) {
      setAuthError('Supabase 未配置，请使用本地账号或填写 .env 后重启');
      return;
    }
    setLoading(true);
    setAuthError('');
    try {
      if (isLogin) {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password })
        );
        if (error) throw error;
      } else {
        const { error, data } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: { data: { username: username || email.split('@')[0] } },
          })
        );
        if (error) throw error;
        if (data.user) {
          await withTimeout(
            supabase.from('profiles').insert({
              id: data.user.id,
              username: username || email.split('@')[0],
              chips: 5000,
            }) as unknown as Promise<unknown>
          );
        }
      }
    } catch (e: any) {
      setAuthError(e.message || 'Auth Error');
    } finally {
      setLoading(false);
    }
  };

  const handleLocalLogin = () => {
    const name = guestName.trim() || email.trim() || 'Guest';
    useGameStore.getState().loginLocalMock(name);
  };

  return (
    <div className="flex flex-col items-center p-8 glass-panel rounded-2xl w-96 max-w-[90vw] shadow-2xl border border-white/10">
      {/* Logo */}
      <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-poker-green to-emerald-400 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.5)] mb-5">
        <span className="text-black font-bold text-3xl">♠</span>
      </div>
      <h2 className="text-2xl font-bold mb-1 tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-cyan-300">
        TEXAS HOLD'EM
      </h2>
      <p className="text-gray-600 text-xs mb-7 tracking-widest uppercase">Multiplayer Poker</p>

      {/* ── Supabase 账号区 ── */}
      {isSupabaseConfigured ? (
        <>
          {!isLogin && (
            <input
              type="text"
              placeholder="Display Name"
              className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white mb-3 focus:outline-none focus:border-emerald-500 transition-colors"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white mb-3 focus:outline-none focus:border-emerald-500 transition-colors"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-emerald-500 transition-colors"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAuth()}
          />

          {authError && (
            <div className="w-full bg-red-500/15 border border-red-500/40 text-red-300 text-xs p-3 rounded-lg mb-4 leading-relaxed">
              🚨 {authError}
            </div>
          )}

          <button
            onClick={handleAuth}
            disabled={loading || !email || !password}
            className="w-full bg-gradient-to-r from-emerald-600 to-poker-green hover:from-emerald-500 text-white font-bold py-3 rounded-lg transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                连接中...
              </span>
            ) : isLogin ? 'LOGIN' : 'SIGN UP'}
          </button>

          <button className="mt-3 text-sm text-gray-500 hover:text-gray-300 transition-colors" onClick={() => { setIsLogin(!isLogin); setAuthError(''); }}>
            {isLogin ? '还没有账号？注册' : '已有账号？登录'}
          </button>
        </>
      ) : (
        /* Supabase 未配置时显示提示 */
        <div className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs p-4 rounded-xl mb-4 text-center leading-relaxed">
          ⚠️ Supabase 未配置<br/>
          <span className="text-gray-500">请在 .env 中填写 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY</span>
        </div>
      )}

      {/* ── 本地账号区（始终显示） ── */}
      <div className="mt-5 pt-4 border-t border-white/[0.07] w-full">
        <p className="text-xs text-gray-600 text-center mb-3">或使用本地临时账号快速体验</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入昵称..."
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLocalLogin()}
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 transition-colors"
          />
          <button
            onClick={handleLocalLogin}
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            快速加入
          </button>
        </div>
      </div>
    </div>
  );
}
