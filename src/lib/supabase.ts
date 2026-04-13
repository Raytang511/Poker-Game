import { createClient } from '@supabase/supabase-js';

// 请在真实运行时于项目根目录创建 .env 文件并填入真实参数
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
