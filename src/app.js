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

// Ajuste no Helmet: desativamos o CSP para evitar bloqueios no frontend do Render
// e configuramos a política de recursos cross-origin para permitir o acesso.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression()); 
app.set('trust proxy', 1); // Essencial para o Render (proxy reverso)

// ── CONFIGURAÇÃO DE CORS (O ponto crítico) ──────────────
app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
    // Permite requisições sem origin (como mobile ou postman) ou se estiver na lista
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Bloqueado pelo CORS: Origem não permitida.'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey'], // 'apikey' é obrigatório para o Supabase
  credentials: true,
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '5mb' }));
app.use(globalRateLimiter);
app.use(requestLogger);

// ── ROTAS ────────────────────────────────────────────────

// Favicon (evita 204/404 desnecessário no log)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 1. Rota Raiz
app.get('/', (req, res) => {
  res.json({
    projeto: "FarmaFind API",
    status: "Operacional",
    versao: "1.0.0",
    ambiente: process.env.NODE_ENV || 'development'
  });
});

// 2. Rota de Verificação de Saúde
app.get('/health', (_, res) => res.json({ 
  status: 'ok', 
  uptime: process.uptime(),
  timestamp: new Date().toISOString() 
}));

// 3. Configuração para o frontend (Use apenas se necessário!)
app.get('/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
});

// 4. Rotas da API
app.use('/api/v1', publicRouter);
app.use('/api/v1/farmacia', farmaciaRouter);

// ── HANDLER GLOBAL DE ERROS ──────────────────────────────
app.use(errorHandler);

export default app;