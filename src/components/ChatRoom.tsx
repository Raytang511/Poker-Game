import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  type: 'text' | 'emoji' | 'phrase';
  timestamp: number;
}

interface ChatRoomProps {
  messages: ChatMessage[];
  onSend: (content: string, type: 'text' | 'emoji' | 'phrase') => void;
  currentUserId: string;
}

const QUICK_PHRASES = [
  'Nice hand! 👏',
  'GG 🤝',
  '加油! 💪',
  '好牌! 🔥',
  '不错不错 👍',
  '手气真好 🍀',
  '快点啦 ⏰',
  '我全下了! 🚀',
];

const EMOJIS = ['😀', '😂', '🤣', '😎', '🤔', '😱', '😤', '🥳', '👍', '👎', '🔥', '💎', '🎉', '💰', '🃏', '♠️', '♥️', '♦️', '♣️', '🏆'];

export default function ChatRoom({ messages, onSend, currentUserId }: ChatRoomProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [showPhrases, setShowPhrases] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastSeenCount, setLastSeenCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isOpen]);

  // Track unread messages when panel is closed
  useEffect(() => {
    if (!isOpen && messages.length > lastSeenCount) {
      setUnreadCount(messages.length - lastSeenCount);
    }
  }, [messages.length, isOpen, lastSeenCount]);

  // Mark as read when opening
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      setLastSeenCount(messages.length);
    }
  }, [isOpen, messages.length]);

  function handleSendText() {
    const text = input.trim();
    if (!text) return;
    onSend(text, 'text');
    setInput('');
    setShowEmojis(false);
    setShowPhrases(false);
  }

  function handleSendEmoji(emoji: string) {
    onSend(emoji, 'emoji');
    setShowEmojis(false);
  }

  function handleSendPhrase(phrase: string) {
    onSend(phrase, 'phrase');
    setShowPhrases(false);
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  return (
    <div className="absolute bottom-4 right-3 z-40 pointer-events-auto">

      {/* ── 展开的聊天面板 ── */}
      {isOpen && (
        <div className="chat-panel rounded-2xl w-72 sm:w-80 h-[380px] flex flex-col shadow-2xl mb-2 overflow-hidden">

          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">💬 聊天室</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-200 text-sm transition-colors"
            >✕</button>
          </div>

          {/* 消息列表 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 chat-panel">
            {messages.length === 0 && (
              <p className="text-gray-600 text-xs text-center mt-8">还没有消息，快来聊天吧！</p>
            )}
            {messages.map((msg, idx) => {
              const isMe = msg.senderId === currentUserId;
              return (
                <div key={msg.id} className={clsx("animate-chat-msg flex flex-col", isMe ? "items-end" : "items-start")}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className={clsx("text-[10px] font-semibold", isMe ? "text-emerald-400/70" : "text-gray-500")}>
                      {isMe ? 'You' : msg.senderName}
                    </span>
                    <span className="text-[9px] text-gray-700">{formatTime(msg.timestamp)}</span>
                  </div>
                  <div className={clsx(
                    "max-w-[85%] px-3 py-1.5 rounded-xl text-sm break-words",
                    msg.type === 'emoji'
                      ? "text-2xl bg-transparent px-1 py-0"
                      : isMe
                        ? "bg-emerald-600/30 text-emerald-100 border border-emerald-500/20"
                        : "bg-white/[0.06] text-gray-300 border border-white/[0.05]"
                  )}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 快捷短语面板 */}
          {showPhrases && (
            <div className="px-3 py-2 border-t border-white/[0.06] flex-shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PHRASES.map(phrase => (
                  <button
                    key={phrase}
                    onClick={() => handleSendPhrase(phrase)}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-gray-300 border border-white/[0.06] transition-all"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 表情面板 */}
          {showEmojis && (
            <div className="px-3 py-2 border-t border-white/[0.06] flex-shrink-0">
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleSendEmoji(emoji)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-lg transition-all"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 输入区域 */}
          <div className="flex items-center gap-1.5 px-3 py-2.5 border-t border-white/[0.06] flex-shrink-0">
            {/* 表情按钮 */}
            <button
              onClick={() => { setShowEmojis(!showEmojis); setShowPhrases(false); }}
              className={clsx(
                "w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-all",
                showEmojis ? "bg-emerald-600/30 text-emerald-300" : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]"
              )}
            >😀</button>

            {/* 短语按钮 */}
            <button
              onClick={() => { setShowPhrases(!showPhrases); setShowEmojis(false); }}
              className={clsx(
                "w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all",
                showPhrases ? "bg-amber-600/30 text-amber-300" : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]"
              )}
              title="快捷短语"
            >💬</button>

            {/* 文本输入 */}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSendText(); }}
              onFocus={() => { setShowEmojis(false); setShowPhrases(false); }}
              placeholder="输入消息..."
              maxLength={100}
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
            />

            {/* 发送按钮 */}
            <button
              onClick={handleSendText}
              disabled={!input.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              发送
            </button>
          </div>
        </div>
      )}

      {/* ── 聊天按钮（收起状态） ── */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all float-right",
          isOpen 
            ? "bg-emerald-600/80 text-white border border-emerald-400/50 scale-90"
            : "bg-black/70 hover:bg-black/90 text-gray-400 hover:text-white border border-white/10 hover:border-emerald-500/40"
        )}
      >
        <span className="text-xl">💬</span>
        {/* 未读消息气泡 */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center chat-badge-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
