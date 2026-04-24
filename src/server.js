// src/server.js
// Entry point — separa a criação da app (app.js) do arranque do servidor.
// Isto facilita testes unitários (importar app sem iniciar o servidor).
// Digamos que a sua pasta com HTML se chama 'public' na raiz do projeto
import app from './app.js';
import { validateEnv } from './config/env.js';
import { logger } from './middleware/requestLogger.js';

// Validar todas as variáveis de ambiente antes de iniciar
validateEnv();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`FarmaFind API a correr na porta ${PORT} [${process.env.NODE_ENV}]`);
});

// Graceful shutdown — importante no Render (SIGTERM ao fazer deploy)
function gracefulShutdown(signal) {
  logger.info(`${signal} recebido. A encerrar servidor...`);
  server.close(() => {
    logger.info('Servidor encerrado correctamente.');
    process.exit(0);
  });
  // Forçar encerramento após 10s se não fechar a tempo
  setTimeout(() => {
    logger.error('Encerramento forçado após timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Capturar erros não tratados — evita crash silencioso
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});
