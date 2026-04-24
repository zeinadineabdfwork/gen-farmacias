// src/utils/generateCode.js
import { supabaseAdmin } from '../config/supabase.js';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sem 0/O/1/I — evita confusão visual

export async function generateCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 4 }, () =>
      CHARS[Math.floor(Math.random() * CHARS.length)]
    ).join('');

    const codigo = `FF-${suffix}`;

    const { count } = await supabaseAdmin
      .from('reservas')
      .select('id', { count: 'exact', head: true })
      .eq('codigo', codigo);

    if (count === 0) return codigo;
  }
  throw new Error('Falha ao gerar código único após 10 tentativas.');
}
