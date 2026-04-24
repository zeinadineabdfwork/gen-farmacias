// src/utils/fingerprint.js
import crypto from 'crypto';
import { env } from '../config/env.js';

// Hash HMAC-SHA256 que identifica de forma anónima e irreversível
// a combinação IP + telefone + janela de 1 hora.
// Permite detectar o mesmo cliente sem guardar dados em texto simples.
export function createFingerprint(ip, tel, timestamp) {
  const window = Math.floor(timestamp / 3_600_000); // Janela de 1 hora
  const data   = `${ip}:${tel}:${window}`;
  return crypto
    .createHmac('sha256', env.FINGERPRINT_SECRET)
    .update(data)
    .digest('hex');
}
