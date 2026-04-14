import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

/**
 * 版本化 auth storage key —— 每次升级版本号会自动使旧 session 失效，
 * 防止部署后浏览器残留过期 token 导致登录循环。
 */
const AUTH_STORAGE_VERSION = 'v3';
const AUTH_STORAGE_KEY = `poker-auth-${AUTH_STORAGE_VERSION}`;

/**
 * 启动时清理 localStorage 中所有旧版本的 auth key 和 Supabase 遗留锁，
 * 避免过期 session 导致 SDK 进入刷新→失败→循环的死循环。
 */
function cleanupStaleAuthKeys() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      // 清理旧版本的 poker-auth-* key（但保留当前版本）
      if (key.startsWith('poker-auth-') && key !== AUTH_STORAGE_KEY) {
        keysToRemove.push(key);
      }
      // 清理 Supabase 默认格式的 auth key（sb-*-auth-token）
      if (key.match(/^sb-.*-auth-token$/)) {
        keysToRemove.push(key);
      }
      // 清理 Supabase 锁 key
      if (key.match(/^sb-.*-auth-token-lock$/)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    if (keysToRemove.length > 0) {
      console.log('[Auth] 已清理旧版 auth key:', keysToRemove);
    }
  } catch { /* 忽略 localStorage 访问错误 */ }
}

cleanupStaleAuthKeys();

/**
 * 提供一个简单的同步 localStorage adapter，绕过 Supabase SDK v2.40+
 * 引入的 IndexedDB 分布式锁机制。该锁在 HMR / 多标签页 / 开发模式下
 * 极易产生死锁，导致所有 auth 调用永久挂起。
 */
const simpleStorage = {
  getItem: (key: string): string | null => {
    try { return window.localStorage.getItem(key); }
    catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    try { window.localStorage.setItem(key, value); }
    catch { /* 隐私模式下 localStorage 可能被禁止 */ }
  },
  removeItem: (key: string): void => {
    try { window.localStorage.removeItem(key); }
    catch {}
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: simpleStorage,         // 跳过 IndexedDB 锁机制
    storageKey: AUTH_STORAGE_KEY,    // 版本化 key，部署后自动使旧 session 失效
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,      // 只用密码登录，不从 URL 解析 session
    flowType: 'implicit',           // 避免 PKCE 流程的额外异步步骤
  },
});

/**
 * 强制重置 auth 状态 —— 当检测到 session 异常时调用，
 * 清除所有 auth 相关的 localStorage 数据并重新加载页面。
 */
export function forceResetAuth() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    // 也尝试清理所有可能的 Supabase auth key
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('poker-auth-') || key.match(/^sb-.*-auth/))) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
  window.location.reload();
}
