// 零依赖、无需下载外挂音频文件的 Web Audio API 合成器
// 增强版 — 更丰富、更有层次的音效

let audioCtx: AudioContext | null = null;

const getAudioCtx = (): AudioContext => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx;
};

// 全局解锁 Audio 权限
export const initAudio = () => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
};

// ─── 基础合成工具 ───

function playTone(
  freq: number, 
  type: OscillatorType, 
  duration: number, 
  vol = 0.1,
  fadeOutStart?: number,
  detune: number = 0
) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime);
    
    const fadeStart = fadeOutStart ?? 0;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    if (fadeStart > 0) {
      gain.gain.setValueAtTime(vol, ctx.currentTime + fadeStart);
    }
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

function playFrequencySweep(
  startFreq: number, 
  endFreq: number, 
  type: OscillatorType, 
  duration: number, 
  vol = 0.08
) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
    
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

// 模拟发牌 — 短促的噪音 + 高频click
function playNoise(duration: number, vol = 0.05, filterFreq = 1000, filterQ = 1) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = filterQ;
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    noise.start();
}

// 筹码碰撞 — 模拟多个小的金属撞击声
function playChipImpact(count: number = 3, baseFreq: number = 2000) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    
    for (let i = 0; i < count; i++) {
      const delay = i * 40 + Math.random() * 20;
      const freq = baseFreq + Math.random() * 1500;
      setTimeout(() => {
        playTone(freq, 'sine', 0.08, 0.04);
        playNoise(0.03, 0.02, 4000, 3);
      }, delay);
    }
}

// ─── 导出的音效集 ───

export const soundEffects = {
    // 发牌 — 纸张摩擦 + 轻微滑动声
    dealCard: () => {
        playNoise(0.08, 0.07, 2000, 2);
        // 添加一个柔和的 "滑" 音
        setTimeout(() => {
          playTone(3000, 'sine', 0.04, 0.02);
        }, 30);
    },
    
    // 下注 — 筹码碰撞声（多层次）
    betChips: () => {
        playChipImpact(4, 1800);
        // 低频 "咚" 声表示筹码落桌
        setTimeout(() => {
          playTone(200, 'sine', 0.12, 0.04);
        }, 100);
    },
    
    // 弃牌 — 低沉且带有 "嗒" 的关闭感
    fold: () => {
        playNoise(0.06, 0.04, 600, 2);
        playFrequencySweep(400, 150, 'triangle', 0.2, 0.05);
        setTimeout(() => playTone(100, 'sine', 0.15, 0.03), 60);
    },
    
    // Check — 轻柔敲桌声
    check: () => {
        playTone(800, 'sine', 0.06, 0.04);
        playNoise(0.04, 0.03, 2000, 3);
    },
    
    // Call — 筹码滑入声 + 确认音
    call: () => {
        playChipImpact(2, 2200);
        setTimeout(() => {
          playTone(600, 'sine', 0.1, 0.03);
        }, 80);
    },
    
    // Raise — 更重的筹码声 + 上升音调  
    raise: () => {
        playChipImpact(5, 1600);
        setTimeout(() => {
          playFrequencySweep(400, 800, 'sine', 0.15, 0.04);
        }, 120);
    },
    
    // All-In — 戏剧性的大量筹码推入 + 低频冲击
    allIn: () => {
        // 筹码雪崩
        for (let i = 0; i < 3; i++) {
          setTimeout(() => playChipImpact(6, 1400 + i * 200), i * 60);
        }
        // 重低音冲击
        setTimeout(() => {
          playTone(80, 'sine', 0.4, 0.08);
          playTone(160, 'triangle', 0.3, 0.04);
        }, 200);
        // 上升的紧张感
        setTimeout(() => {
          playFrequencySweep(200, 600, 'sawtooth', 0.3, 0.03);
        }, 300);
    },
    
    // 轮到自己 — 两声清脆提示 + 柔和泛音
    myTurn: () => {
        playTone(660, 'sine', 0.12, 0.05);
        setTimeout(() => {
          playTone(880, 'sine', 0.15, 0.05);
          playTone(1320, 'sine', 0.1, 0.02); // 和声泛音
        }, 120);
    },
    
    // 胜利 — 上升的和弦琶音 + 明亮泛音
    win: () => {
        const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
        notes.forEach((freq, i) => {
          setTimeout(() => {
            playTone(freq, 'sine', 0.4 - i * 0.05, 0.08);
            playTone(freq * 2, 'sine', 0.2, 0.02); // 八度泛音
          }, i * 120);
        });
        // 最后的闪亮音
        setTimeout(() => {
          playTone(1568, 'sine', 0.5, 0.04); // G6
          playNoise(0.15, 0.03, 6000, 1);
        }, 500);
    },
    
    // 新一局开始 — 柔和的 "准备好了" 音
    newHand: () => {
        playTone(440, 'sine', 0.15, 0.04);
        setTimeout(() => playTone(554, 'sine', 0.15, 0.04), 100);
        setTimeout(() => playTone(440, 'sine', 0.2, 0.04), 200);
    },
    
    // 翻牌 (Flop/Turn/River) — 牌翻开的声音
    revealCard: () => {
        playNoise(0.06, 0.06, 1500, 2);
        setTimeout(() => {
          playTone(1200, 'sine', 0.05, 0.03);
        }, 40);
    },
    
    // 超时警告 — 紧迫的滴答声
    timeWarning: () => {
        playTone(1000, 'square', 0.05, 0.03);
        setTimeout(() => playTone(1000, 'square', 0.05, 0.03), 150);
    },
    
    // 按钮点击 — UI 反馈
    uiClick: () => {
        playTone(1200, 'sine', 0.04, 0.02);
    }
};
