import { Router } from 'express';
import { searchController } from '../controllers/searchController.js';
import { reservaController } from '../controllers/reservaController.js';
import { farmaciaController } from '../controllers/farmaciaController.js';
import { searchRateLimiter, reservaRateLimiter } from '../middleware/rateLimiter.js';
import { upload } from '../services/uploadService.js';
 
export const publicRouter = Router();
 
// ── GET /api/v1/search ────────────────────────────────────
// Pesquisa medicamentos por nome e proximidade geográfica
// Query params: q, lat, lng, raio (km, default=10), limite
publicRouter.get(
  '/search',
  searchRateLimiter,
  searchController.search
);
 
// ── GET /api/v1/farmacias ─────────────────────────────────
// Lista farmácias activas (para o mapa)
publicRouter.get(
  '/farmacias',
  searchRateLimiter,
  searchController.listFarmacias
);
 
// ── POST /api/v1/reservar ─────────────────────────────────
// Cria uma nova reserva (sem login obrigatório)
// Body: { farmacia_id, itens[], cliente_nome, cliente_tel, receita_base64? }
publicRouter.post(
  '/reservar',
  reservaRateLimiter,
  upload.single('receita'),     // Multer para ficheiro
  reservaController.criar
);
 
// ── GET /api/v1/reservas/:codigo ─────────────────────────
// Utente consulta a sua reserva pelo código FF-XXXX
publicRouter.get(
  '/reservas/:codigo',
  searchRateLimiter,
  reservaController.consultar
);
// ── POST /api/v1/cadastrar-farmacia ───────────────────────
// Cadastra uma nova farmácia e cria conta de admin
// Body: { nome, slug, nuit, email, tel, password, whatsapp?, cidade, morada, lat?, lon?, logo_base64?, horarios, servicos, notas? }
publicRouter.post(
  '/cadastrar-farmacia',
  farmaciaController.cadastrar
);