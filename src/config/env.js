// src/config/env.js
// Valida todas as variáveis de ambiente obrigatórias no arranque.
// Se alguma estiver em falta, o servidor não inicia — falha cedo e claramente.
// src/config/env.js
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Isso sobe um nível (de src/config para a raiz) para achar o .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_KEY',
  'ALLOWED_ORIGINS',
  'FINGERPRINT_SECRET',
];

export function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌  Variáveis de ambiente em falta:');
    missing.forEach((v) => console.error(`   • ${v}`));
    console.error('   Consulte o ficheiro .env.example');
    process.exit(1);
  }
}

// Acessores tipados — usar estes em vez de process.env directamente
export const env = {
  NODE_ENV:               process.env.NODE_ENV || 'development',
  PORT:                   Number(process.env.PORT) || 3000,
  SUPABASE_URL:           process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY:      process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY:   process.env.SUPABASE_SERVICE_KEY,
  ALLOWED_ORIGINS:        process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || [],
  FINGERPRINT_SECRET:     process.env.FINGERPRINT_SECRET,
  REDIS_URL:              process.env.REDIS_URL || null,
  STORAGE_BUCKET:         process.env.STORAGE_BUCKET_RECEITAS || 'receitas',
  STORAGE_BUCKET_LOGOS:   process.env.STORAGE_BUCKET_LOGOS || 'logos',
  isProd:                 process.env.NODE_ENV === 'production',
  isDev:                  process.env.NODE_ENV !== 'production',
};
