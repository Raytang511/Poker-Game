import React, { useState } from 'react';
import { useGameStore } from '../store/useGameStore';

interface RedeemModalProps {
  onClose: () => void;
}

export default function RedeemModal({ onClose }: RedeemModalProps) {
  const { redeemCode } = useGameStore();
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRedeem = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setMsg('');
    try {
      const result = await redeemCode(input.trim());
      setMsg(result);
      setIsError(false);
      setInput('');
    } catch (e: any) {
      setMsg(e.message);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl w-full max-w-sm shadow-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-white tracking-wide">积分兑换</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors">✕</button>
        </div>

        <p className="text-gray-500 text-xs mb-4 leading-relaxed">
          输入由管理员发放的兑换码，即可获得对应的筹码奖励。
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入兑换码..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRedeem()}
            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors uppercase tracking-wider"
            autoFocus
          />
          <button
            onClick={handleRedeem}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-40"
          >
            {loading ? '...' : '兑换'}
          </button>
        </div>

        {msg && (
          <div className={`mt-3 text-sm p-3 rounded-lg ${
            isError
              ? 'bg-red-500/15 border border-red-500/30 text-red-300'
              : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
          }`}>
            {isError ? '🚨 ' : '✅ '}{msg}
          </div>
        )}
      </div>
    </div>
  );
}
