// src/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';

// Redis é opcional — em desenvolvimento usa memória se REDIS_URL não estiver definido
// A importação é dinâmica para não quebrar o arranque quando redis não está instalado
let _redisStore = undefined;

async function initRedisStore() {
  if (!process.env.REDIS_URL) return;
  try {
    const { createClient }  = await import('redis');
    const { default: RedisStore } = await import('rate-limit-redis');
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => {
      console.error('[Redis] Erro de ligação — rate limiter em memória:', err.message);
    });
    await client.connect();
    _redisStore = new RedisStore({ sendCommand: (...args) => client.sendCommand(args) });
    console.info('[Redis] Ligado com sucesso para rate limiting.');
  } catch (err) {
    console.warn('[Redis] Não disponível — usando memória:', err.message);
    _redisStore = undefined;
  }
}

// Inicializar Redis de forma não-bloqueante no arranque
initRedisStore();

// ── 1. Rate limiter global ───────────────────────────────
// Protege toda a API de DDoS básico
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max:      200,              // 200 req por IP
  message:  { error: 'Muitas tentativas. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
  skip: (req) => req.path === '/health', // Não limitar health checks
});

// ── 2. Rate limiter de pesquisa ──────────────────────────
// Mais permissivo — pesquisa é frequente
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minuto
  max:      30,         // 30 pesquisas por minuto
  message:  { error: 'Muitas pesquisas. Aguarde um momento.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── 3. Rate limiter de reserva ───────────────────────────
// Mais restritivo — reservas são acções críticas
export const reservaRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hora
  max:      5,                // Máx 5 reservas por IP por hora
  message:  { error: 'Limite de reservas por hora atingido.' },
  standardHeaders: true,
  legacyHeaders:   false,
  get store() { return _redisStore; }, // Usa Redis se disponível, senão memória
});

// ── 4. Rate limiter do painel admin ──────────────────────
export const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      300,
  message:  { error: 'Muitas requests ao painel.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── 5. Rate limiter de login — protege contra brute-force ────────────────────
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max:      10,               // Máx 10 tentativas de login por IP
  message:  { error: 'Demasiadas tentativas de login. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
});