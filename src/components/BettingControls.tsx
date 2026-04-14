import React, { useState, useRef, useEffect } from 'react';
import { Player, Action } from '../game/types';
import { soundEffects } from '../lib/audio';
import clsx from 'clsx';

interface BettingControlsProps {
  me: Player;
  pot: number;
  currentBet: number;
  bigBlind: number;
  onAction: (action: Action, amount?: number) => void;
}

export default function BettingControls({ me, pot, currentBet, bigBlind, onAction }: BettingControlsProps) {
  const callAmount = Math.max(0, currentBet - me.bet);
  const minRaise = currentBet > 0
    ? Math.min(me.chips, (currentBet * 2) - me.bet)
    : bigBlind;

  // 预设快捷下注（基于底池）
  const presets = [
    { label: '1/3 Pot', value: Math.max(minRaise, Math.round(pot / 3)) },
    { label: '1/2 Pot', value: Math.max(minRaise, Math.round(pot / 2)) },
    { label: '1× Pot', value: Math.max(minRaise, pot) },
    { label: '3× BB',  value: Math.max(minRaise, bigBlind * 3) },
  ];
  // 去掉超过玩家筹码的选项，并去重
  const validPresets = presets
    .map(p => ({ ...p, value: Math.min(p.value, me.chips) }))
    .filter((p, i, arr) => i === 0 || p.value !== arr[i - 1].value);

  const [raiseAmount, setRaiseAmount] = useState<number>(minRaise);
  const [customInput, setCustomInput] = useState<string>('');
  const [showCustom, setShowCustom] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);

  // 同步 minRaise 变化
  useEffect(() => {
    setRaiseAmount(prev => Math.max(prev, minRaise));
  }, [minRaise]);

  useEffect(() => {
    if (showCustom) customRef.current?.focus();
  }, [showCustom]);

  const effectiveRaise = Math.min(Math.max(raiseAmount, minRaise), me.chips);

  function handlePreset(value: number) {
    setRaiseAmount(value);
    setShowCustom(false);
  }

  function handleCustomConfirm() {
    const v = parseInt(customInput, 10);
    if (!isNaN(v) && v >= minRaise) {
      setRaiseAmount(Math.min(v, me.chips));
      setShowCustom(false);
      setCustomInput('');
    }
  }

  function handleRaise() {
    soundEffects.raise();
    onAction(currentBet > 0 ? 'raise' : 'bet', effectiveRaise);
  }

  function handleAllIn() {
    soundEffects.allIn();
    onAction('all_in');
  }

  function handleCallCheck() {
    if (callAmount > 0) {
      soundEffects.call();
      onAction('call');
    } else {
      soundEffects.check();
      onAction('check');
    }
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-[780px]">

      {/* ── 第一排：快捷下注 + 自定义 ── */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {validPresets.map(preset => (
          <button
            key={preset.label}
            onClick={() => handlePreset(preset.value)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border",
              raiseAmount === preset.value && !showCustom
                ? "bg-emerald-600/80 border-emerald-400/60 text-white shadow-[0_0_10px_rgba(52,211,153,0.4)]"
                : "bg-white/[0.06] border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.12]"
            )}
          >
            {preset.label}
            <span className="ml-1 text-[10px] opacity-70">${preset.value.toLocaleString()}</span>
          </button>
        ))}

        {/* 自定义输入切换 */}
        {!showCustom ? (
          <button
            onClick={() => setShowCustom(true)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border bg-white/[0.06] border-white/[0.08] text-gray-400 hover:text-white hover:bg-white/[0.12] transition-all"
          >
            Custom...
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input
              ref={customRef}
              type="number"
              min={minRaise}
              max={me.chips}
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCustomConfirm(); if (e.key === 'Escape') setShowCustom(false); }}
              placeholder={`${minRaise}+`}
              className="w-24 bg-black/60 border border-emerald-500/50 rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-emerald-400 font-mono"
            />
            <button
              onClick={handleCustomConfirm}
              className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-700/80 hover:bg-emerald-600 text-white border border-emerald-500/30 transition-all"
            >
              OK
            </button>
            <button
              onClick={() => setShowCustom(false)}
              className="px-2 py-1.5 rounded-lg text-[11px] text-gray-500 hover:text-gray-300 transition-all"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ── 第二排：滑块 + 金额显示 (居中) ── */}
      <div className="flex items-center justify-center gap-3 w-full max-w-md mx-auto my-1 bg-white/[0.04] px-4 py-2.5 rounded-2xl border border-white/[0.06]">
        <input
          type="range"
          min={minRaise}
          max={me.chips}
          step={Math.max(1, Math.floor(me.chips / 100))}
          value={effectiveRaise}
          onChange={e => { setRaiseAmount(Number(e.target.value)); setShowCustom(false); }}
          className="flex-1"
        />
        <span className="font-mono text-emerald-300 text-sm font-bold whitespace-nowrap min-w-[60px] text-right">
          ${effectiveRaise.toLocaleString()}
        </span>
      </div>

      {/* ── 第三排：主操作按钮 ── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">

        {/* Fold */}
        <button
          onClick={() => { soundEffects.fold(); onAction('fold'); }}
          className="px-4 py-2.5 rounded-xl font-bold bg-white/[0.06] hover:bg-white/[0.12] text-gray-400 hover:text-gray-200 transition-all uppercase tracking-widest text-xs border border-white/[0.05] whitespace-nowrap"
        >
          Fold
        </button>

        {/* Check / Call */}
        <button
          onClick={handleCallCheck}
          className={clsx(
            "px-5 py-2.5 rounded-xl font-bold text-white uppercase tracking-widest text-xs transition-all whitespace-nowrap",
            callAmount > 0
              ? "bg-blue-600 hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)]"
              : "bg-slate-600 hover:bg-slate-500"
          )}
        >
          {callAmount > 0 ? `Call $${callAmount.toLocaleString()}` : 'Check'}
        </button>



        {/* Raise / Bet */}
        <button
          onClick={handleRaise}
          className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(52,211,153,0.4)] hover:shadow-[0_0_25px_rgba(52,211,153,0.6)] transition-all uppercase tracking-widest text-xs whitespace-nowrap"
        >
          {currentBet > 0 ? 'Raise' : 'Bet'}
        </button>

        {/* All-In */}
        <button
          onClick={handleAllIn}
          className="px-4 py-2.5 rounded-xl font-black bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] hover:shadow-[0_0_30px_rgba(220,38,38,0.7)] transition-all transform hover:scale-105 uppercase tracking-widest text-xs whitespace-nowrap"
        >
          All-In
        </button>
      </div>
    </div>
  );
}
