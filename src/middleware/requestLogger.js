// src/middleware/requestLogger.js
// Logger centralizado com Winston + middleware de log de requests HTTP.

import { createLogger, format, transports } from 'winston';
import { env } from '../config/env.js';

// ── LOGGER BASE ───────────────────────────────────────────────────────────────
export const logger = createLogger({
  level: env.isProd ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    env.isProd
      ? format.json()                          // JSON estruturado em produção (Render logs)
      : format.combine(format.colorize(), format.simple()) // Legível em dev
  ),
  transports: [
    new transports.Console(),
  ],
  // Não terminar o processo em erros do logger
  exitOnError: false,
});

// ── MIDDLEWARE HTTP ───────────────────────────────────────────────────────────
// Regista cada request com método, URL, IP, status e duração
export function requestLogger(req, res, next) {
  const start = Date.now();

  // Anonimizar IPs nos logs (RGPD) — guarda apenas os primeiros 3 octetos
  const anonIp = req.ip?.split('.').slice(0, 3).join('.') + '.xxx';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';

    logger[level]({
      method:   req.method,
      url:      req.originalUrl,
      status:   res.statusCode,
      ms:       duration,
      ip:       anonIp,
      ua:       req.headers['user-agent']?.substring(0, 80),
    });
  });

  next();
}
