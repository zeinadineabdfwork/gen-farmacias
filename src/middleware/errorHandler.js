// src/middleware/errorHandler.js
// Handler global de erros do Express.
// Centraliza todas as respostas de erro — nunca vazar stack traces em produção.

import { logger } from './requestLogger.js';
import { env } from '../config/env.js';

// Classe de erro personalizada para erros operacionais (esperados)
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name       = 'AppError';
    this.statusCode = statusCode;
    this.details    = details;
    this.isOperational = true; // Distingue de erros de programação
  }
}

// Converter erros específicos de bibliotecas em AppError
function normalizeError(err) {
  // Erros do Supabase
  if (err?.code === 'PGRST116') return new AppError('Registo não encontrado.', 404);
  if (err?.code === '23505')    return new AppError('Registo duplicado.', 409);
  if (err?.code === '23503')    return new AppError('Referência inválida.', 400);

  // Erros de JSON malformado
  if (err?.type === 'entity.parse.failed') return new AppError('JSON inválido no corpo do pedido.', 400);

  // Erros de upload (Multer)
  if (err?.code === 'LIMIT_FILE_SIZE') return new AppError('Ficheiro demasiado grande. Máximo: 5MB.', 413);
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') return new AppError('Campo de ficheiro inesperado.', 400);

  return err;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);

  const statusCode = normalized.statusCode || 500;
  const message    = normalized.message    || 'Erro interno do servidor.';
  const isOperational = normalized.isOperational || false;

  // Registar o erro
  if (statusCode >= 500) {
    logger.error({
      message:    message,
      stack:      err.stack,
      url:        req.originalUrl,
      method:     req.method,
      ip:         req.ip,
      statusCode,
    });
  } else {
    logger.warn({ message, url: req.originalUrl, statusCode });
  }

  // Resposta ao cliente
  const response = {
    success: false,
    error:   message,
    // Incluir detalhes de validação apenas em dev, ou se for AppError com details
    ...(env.isDev && { stack: err.stack }),
    ...(normalized.details && { details: normalized.details }),
  };

  res.status(statusCode).json(response);
}
