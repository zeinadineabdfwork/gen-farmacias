// src/config/supabase.js
// Dois clientes Supabase com papéis distintos:
//
//  supabasePublic  → usa ANON_KEY  → respeita RLS → para validações leves
//  supabaseAdmin   → usa SERVICE_ROLE_KEY → ignora RLS → operações do servidor
//
// REGRA: nunca expor supabaseAdmin ao exterior. Só usar em services/controllers.

import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Cliente público (anon) — respeita Row Level Security
export const supabasePublic = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false },
    db:   { schema: 'public' },
  }
);

// Cliente admin (service_role) — ignora RLS — usar com extremo cuidado
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: { schema: 'public' },
  }
);
