// 零依赖、无需下载外挂音频文件的 Web Audio API 合成器
const getAudioCtx = () => {
    if (!window.audioCtx) {
        window.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return window.audioCtx;
};

// 全局解锁 Audio 权限（浏览器安全限制，必须要有用户点击才能发声）
export const initAudio = () => {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }
};

function playTone(freq: number, type: OscillatorType, duration: number, vol = 0.1) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

// 模拟发牌“刷”的短促摩擦声
function playNoise(duration: number, vol = 0.05) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    // 使用带通滤波器制造类似纸张摩擦的高频短促音
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    noise.start();
}

export const soundEffects = {
    // 发牌 (短促白噪音摩擦)
    dealCard: () => {
        playNoise(0.12, 0.08); 
    },
    // 下注/碰撞筹码 (两声清脆的高频清响)
    betChips: () => {
        playTone(1800, 'sine', 0.1, 0.06);
        setTimeout(() => playTone(2400, 'sine', 0.15, 0.05), 60);
    },
    // 弃牌 (低沉的下降音)
    fold: () => {
        playTone(200, 'sawtooth', 0.15, 0.05);
        setTimeout(() => playTone(150, 'sawtooth', 0.2, 0.05), 80);
    },
    // 轮到自己操作的提示音 (两声急促滴滴)
    myTurn: () => {
        playTone(600, 'square', 0.1, 0.03);
        setTimeout(() => playTone(800, 'square', 0.15, 0.03), 100);
    },
    // 胜利结算 (轻快上扬的合成和弦)
    win: () => {
        playTone(440, 'sine', 0.2, 0.1);
        setTimeout(() => playTone(554, 'sine', 0.2, 0.1), 100); // C#
        setTimeout(() => playTone(659, 'sine', 0.4, 0.1), 200); // E
    }
};

declare global {
    interface Window { audioCtx: AudioContext; }
}
