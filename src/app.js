import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { publicRouter } from './routes/public.js';
import { farmaciaRouter } from './routes/farmacia.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// ── SEGURANÇA BASE ───────────────────────────────────────
app.use(express.static('public'));
app.use(helmet());                   // Headers HTTP de segurança
app.use(compression());              // GZIP — crítico para redes lentas
app.set('trust proxy', 1);           // Render usa proxy reverso

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '5mb' }));  // limite para uploads base64
app.use(globalRateLimiter);
app.use(requestLogger);

// ── ROTAS ────────────────────────────────────────────────

// Favicon (evita 404 no console)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 1. Rota Raiz (Resolve o "Cannot GET /")
app.get('/', (req, res) => {
  res.json({
    projeto: "FarmaFind API",
    status: "Operacional",
    versao: "1.0.0",
    documentacao: "/api/v1"
  });
});

// 2. Rota de Verificação de Saúde
app.get('/health', (_, res) => res.json({ 
  status: 'ok', 
  uptime: process.uptime(),
  timestamp: new Date().toISOString() 
}));

// 2.1. Configuração pública para o frontend
app.get('/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// 3. Rotas da API
app.use('/api/v1', publicRouter);
app.use('/api/v1/farmacia', farmaciaRouter);

// ── HANDLER GLOBAL DE ERROS ──────────────────────────────
app.use(errorHandler);

export default app;