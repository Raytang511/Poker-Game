import React, { useState } from 'react';
import { useGameStore, RoomConfig } from '../store/useGameStore';
import AuthWidget from './AuthWidget';
import RoomCreationModal from './RoomCreationModal';
import clsx from 'clsx';

// 预设房间（固定 ID 作为房间码）
const PRESET_ROOMS: RoomConfig[] = [
  { id: 'novice', name: '新手桌', type: 'beginner', sb: 1,  bb: 2,  mode: 'casual', startingChips: 5000 },
  { id: 'pro',    name: '进阶桌', type: 'advanced', sb: 5,  bb: 10, mode: 'casual', startingChips: 5000 },
  { id: 'vip',    name: '高手桌', type: 'expert',   sb: 20, bb: 50, mode: 'casual', startingChips: 5000 },
];

const ROOM_EMOJI: Record<string, string> = {
  beginner: '🌱',
  advanced: '🔥',
  expert:   '💎',
  custom:   '⚙️',
};

// 用房间 ID 生成一个可读的"房间码"（大写展示）
function displayCode(id: string) {
  return id.toUpperCase().slice(0, 6);
}

export default function Lobby() {
  const { user, joinRoom } = useGameStore();
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  if (!user) return <AuthWidget />;

  // 通过房间码加入（支持预设 + 自定义）
  const handleJoinByCode = () => {
    const code = joinCode.trim().toLowerCase();
    if (!code) return;

    // 先查预设房间
    const preset = PRESET_ROOMS.find(r => r.id === code || r.id === joinCode.trim());
    if (preset) {
      joinRoom(preset);
      return;
    }

    // 任意自定义 code：以默认配置加入（房主加入后作为 Host 初始化）
    if (code.length < 3) {
      setJoinError('房间码至少 3 位');
      return;
    }
    setJoinError('');
    // 用代码作为 roomId，使用默认休闲配置；如果房主已在内则会同步他的状态
    joinRoom({
      id: code,
      name: `房间 ${code.toUpperCase()}`,
      type: 'custom',
      sb: 1,
      bb: 2,
      mode: 'casual',
      startingChips: 5000,
    });
  };

  return (
    <div className="flex flex-col w-full max-w-3xl px-5 py-8 gap-8 relative z-10">

      {/* ── 顶部：加入房间 ── */}
      <div className="glass-panel rounded-2xl p-6 border border-white/[0.07]">
        <h2 className="text-base font-bold text-white mb-1 tracking-wide">加入房间</h2>
        <p className="text-gray-500 text-xs mb-4">输入房间码或直接点击下方桌子加入</p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入房间码（如 ABC123）..."
            value={joinCode}
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
            maxLength={12}
            className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 tracking-widest font-mono uppercase transition-colors"
          />
          <button
            onClick={handleJoinByCode}
            disabled={!joinCode.trim()}
            className="px-6 py-3 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white text-sm transition-all disabled:opacity-30 uppercase tracking-wider"
          >
            加入
          </button>
        </div>
        {joinError && (
          <p className="text-red-400 text-xs mt-2">🚨 {joinError}</p>
        )}
      </div>

      {/* ── 预设桌子 ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">公共桌</h2>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/25 transition-all uppercase tracking-wider"
          >
            ＋ 创建私人房间
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PRESET_ROOMS.map(room => (
            <button
              key={room.id}
              onClick={() => joinRoom(room)}
              className="glass-panel p-5 rounded-2xl flex flex-col items-center text-center hover:-translate-y-1 transition-all border border-white/[0.06] hover:border-emerald-500/40 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <span className="text-2xl mb-3">{ROOM_EMOJI[room.type]}</span>
              <p className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors">{room.name}</p>
              <p className="text-gray-600 text-xs mt-1">
                SB ${room.sb} / BB ${room.bb}
              </p>

              {/* 房间码 */}
              <div className="mt-3 px-2.5 py-1 rounded-full bg-black/40 border border-white/[0.06] group-hover:border-emerald-500/20 transition-colors">
                <span className="font-mono text-[10px] text-gray-500 tracking-widest group-hover:text-emerald-500/70 transition-colors">
                  #{displayCode(room.id)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 竞技/无限注说明 ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: '⚔️', title: '竞技模式', desc: '自定义筹码，赢光对手即胜利' },
          { icon: '∞',  title: '无限注',   desc: '筹码耗尽可买入，积分看板统计战绩' },
        ].map(item => (
          <button
            key={item.title}
            onClick={() => setShowCreate(true)}
            className="glass-panel p-4 rounded-xl border border-white/[0.05] hover:border-amber-500/30 text-left transition-all group"
          >
            <span className="text-lg block mb-1">{item.icon}</span>
            <p className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors">{item.title}</p>
            <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
          </button>
        ))}
      </div>

      {/* 创建房间弹窗 */}
      {showCreate && (
        <RoomCreationModal
          onClose={() => setShowCreate(false)}
          onJoin={joinRoom}
        />
      )}
    </div>
  );
}
