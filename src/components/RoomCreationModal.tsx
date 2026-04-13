import React, { useState } from 'react';
import { RoomConfig } from '../store/useGameStore';
import { RoomMode } from '../game/types';
import clsx from 'clsx';

interface RoomCreationModalProps {
  onClose: () => void;
  onJoin: (room: RoomConfig) => void;
}

const MODE_INFO: Record<RoomMode, { label: string; icon: string; desc: string }> = {
  casual:      { label: '休闲模式', icon: '🃏', desc: '无限制畅玩，筹码不影响排名' },
  competitive: { label: '竞技模式', icon: '⚔️', desc: '自定义筹码，赢光对手所有筹码为胜' },
  unlimited:   { label: '无限注', icon: '∞',  desc: '耗尽可再次买入，积分看板实时统计' },
};

const BLIND_PRESETS = [
  { sb: 1, bb: 2, label: '1/2' },
  { sb: 5, bb: 10, label: '5/10' },
  { sb: 10, bb: 20, label: '10/20' },
  { sb: 25, bb: 50, label: '25/50' },
  { sb: 50, bb: 100, label: '50/100' },
];

const CHIP_PRESETS = [1000, 5000, 10000, 50000, 100000];

export default function RoomCreationModal({ onClose, onJoin }: RoomCreationModalProps) {
  const [mode, setMode] = useState<RoomMode>('casual');
  const [roomName, setRoomName] = useState('我的房间');
  const [sbIdx, setSbIdx] = useState(0);
  const [startingChips, setStartingChips] = useState(10000);
  const [customChips, setCustomChips] = useState('');
  const [step, setStep] = useState<'mode' | 'config'>('mode');

  const selectedBlinds = BLIND_PRESETS[sbIdx];

  function handleCreate() {
    const chips = customChips ? parseInt(customChips, 10) : startingChips;
    const room: RoomConfig = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: roomName || '自定义房间',
      type: 'custom',
      sb: selectedBlinds.sb,
      bb: selectedBlinds.bb,
      mode,
      startingChips: isNaN(chips) ? startingChips : chips,
    };
    onJoin(room);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel rounded-2xl w-full max-w-md shadow-2xl border border-white/10 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <h2 className="font-bold text-white tracking-wide">创建房间</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-lg transition-colors">✕</button>
        </div>

        {/* Step 1: 选择模式 */}
        {step === 'mode' && (
          <div className="p-6 space-y-3">
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-4">选择游戏模式</p>

            {(Object.entries(MODE_INFO) as [RoomMode, typeof MODE_INFO[RoomMode]][]).map(([m, info]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={clsx(
                  "w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all",
                  mode === m
                    ? "bg-emerald-600/20 border-emerald-500/40 shadow-[0_0_15px_rgba(52,211,153,0.1)]"
                    : "bg-white/[0.03] border-white/[0.07] hover:border-white/20"
                )}
              >
                <span className="text-2xl">{info.icon}</span>
                <div>
                  <p className={clsx("font-bold text-sm", mode === m ? "text-emerald-300" : "text-white")}>
                    {info.label}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">{info.desc}</p>
                </div>
                {mode === m && (
                  <span className="ml-auto text-emerald-400 text-sm">✓</span>
                )}
              </button>
            ))}

            <button
              onClick={() => setStep('config')}
              className="w-full mt-4 py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all uppercase tracking-widest text-sm"
            >
              下一步 →
            </button>
          </div>
        )}

        {/* Step 2: 配置参数 */}
        {step === 'config' && (
          <div className="p-6 space-y-5">
            <button
              onClick={() => setStep('mode')}
              className="text-gray-500 hover:text-gray-300 text-xs flex items-center gap-1 transition-colors mb-2"
            >
              ← 返回选择模式
            </button>

            {/* 房间名 */}
            <div>
              <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1.5">房间名称</label>
              <input
                type="text"
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                maxLength={20}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="我的房间"
              />
            </div>

            {/* 盲注选择 */}
            <div>
              <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1.5">盲注等级</label>
              <div className="grid grid-cols-5 gap-1.5">
                {BLIND_PRESETS.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => setSbIdx(i)}
                    className={clsx(
                      "py-2 rounded-lg text-xs font-bold transition-all border",
                      sbIdx === i
                        ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300"
                        : "bg-white/[0.04] border-white/[0.06] text-gray-400 hover:text-white"
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="text-gray-600 text-[10px] mt-1">
                小盲 ${selectedBlinds.sb} / 大盲 ${selectedBlinds.bb}
              </p>
            </div>

            {/* 初始筹码（竞技/无限注模式） */}
            {mode !== 'casual' && (
              <div>
                <label className="text-gray-500 text-[10px] uppercase tracking-widest block mb-1.5">
                  初始筹码
                  {mode === 'unlimited' && <span className="ml-1 text-gray-600">(每次买入)</span>}
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CHIP_PRESETS.map(c => (
                    <button
                      key={c}
                      onClick={() => { setStartingChips(c); setCustomChips(''); }}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                        startingChips === c && !customChips
                          ? "bg-emerald-600/30 border-emerald-500/50 text-emerald-300"
                          : "bg-white/[0.04] border-white/[0.06] text-gray-400 hover:text-white"
                      )}
                    >
                      {c >= 1000 ? `${c/1000}k` : c}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={customChips}
                  onChange={e => setCustomChips(e.target.value)}
                  placeholder={`自定义（当前: ${startingChips.toLocaleString()}）`}
                  min={selectedBlinds.bb * 10}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            )}

            {/* 模式说明小卡片 */}
            <div className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-1">
                <span>{MODE_INFO[mode].icon}</span>
                <span className="text-white text-xs font-semibold">{MODE_INFO[mode].label}</span>
              </div>
              <p className="text-gray-500 text-[10px]">{MODE_INFO[mode].desc}</p>
              <p className="text-gray-600 text-[10px] mt-1">
                盲注: ${selectedBlinds.sb}/${selectedBlinds.bb}
                {mode !== 'casual' && ` · 筹码: $${(customChips ? parseInt(customChips) : startingChips).toLocaleString()}`}
              </p>
            </div>

            <button
              onClick={handleCreate}
              className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white transition-all uppercase tracking-widest text-sm shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              创建并加入房间
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
