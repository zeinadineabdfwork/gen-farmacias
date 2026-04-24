// src/routes/farmacia.js
import { Router } from 'express';
import { farmaciaController } from '../controllers/farmaciaController.js';
import { reservaController } from '../controllers/reservaController.js';
import { authGuard } from '../middleware/authGuard.js';
import { adminRateLimiter } from '../middleware/rateLimiter.js';
 
export const farmaciaRouter = Router();
 
// Todas as rotas abaixo exigem JWT válido do Supabase Auth
farmaciaRouter.use(authGuard);
farmaciaRouter.use(adminRateLimiter);
 
// ── DASHBOARD ─────────────────────────────────────────────
farmaciaRouter.get('/dashboard', farmaciaController.dashboard);
 
// ── RESERVAS ──────────────────────────────────────────────
// Listar reservas da farmácia (com filtros: status, data)
farmaciaRouter.get('/reservas', reservaController.listarPorFarmacia);
 
// Marcar reserva como PAGA → abate stock via trigger SQL
farmaciaRouter.patch('/reservas/:id/pagar', reservaController.marcarPago);
 
// Cancelar reserva
farmaciaRouter.patch('/reservas/:id/cancelar', reservaController.cancelar);
 
// Ver foto da receita (URL assinada temporária)
farmaciaRouter.get('/reservas/:id/receita', reservaController.verReceita);
 
// ── STOCK / MEDICAMENTOS ──────────────────────────────────
farmaciaRouter.get('/medicamentos', farmaciaController.listarMedicamentos);
farmaciaRouter.post('/medicamentos', farmaciaController.criarMedicamento);
farmaciaRouter.patch('/medicamentos/:id', farmaciaController.atualizarMedicamento);
farmaciaRouter.delete('/medicamentos/:id', farmaciaController.removerMedicamento);
 
// ── ALERTAS DE STOCK ─────────────────────────────────────
farmaciaRouter.get('/alertas', farmaciaController.alertasStock);
 
// ── PERFIL DA FARMÁCIA ───────────────────────────────────
farmaciaRouter.patch('/perfil', farmaciaController.atualizarPerfil);
