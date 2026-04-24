// src/services/stockService.js
// CRUD completo de medicamentos para o portal da farmácia.
// Toda a lógica de negócio de stock está centralizada aqui.

import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { medicamentoSchema } from '../utils/validators.js';

export const stockService = {

  // ── LISTAR todos os medicamentos de uma farmácia ──────────────────────────
  async listar(farmaciaId, { incluiInativos = false } = {}) {
    let query = supabaseAdmin
      .from('medicamentos')
      .select('*')
      .eq('farmacia_id', farmaciaId)
      .order('nome', { ascending: true });

    if (!incluiInativos) query = query.eq('ativo', true);

    const { data, error } = await query;
    if (error) throw new AppError('Erro ao carregar medicamentos.', 500);
    return data;
  },

  // ── CRIAR novo medicamento ────────────────────────────────────────────────
  async criar(farmaciaId, payload) {
    const parsed = medicamentoSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError('Dados inválidos.', 400, parsed.error.format());
    }

    const { data, error } = await supabaseAdmin
      .from('medicamentos')
      .insert({ ...parsed.data, farmacia_id: farmaciaId })
      .select()
      .single();

    if (error) throw new AppError(`Erro ao criar medicamento: ${error.message}`, 500);
    return data;
  },

  // ── ACTUALIZAR medicamento (inclui ajuste de stock) ───────────────────────
  async actualizar(id, farmaciaId, payload) {
    // Verificar que o medicamento pertence a esta farmácia
    await this._verificarPropriedade(id, farmaciaId);

    const parsed = medicamentoSchema.partial().safeParse(payload);
    if (!parsed.success) {
      throw new AppError('Dados inválidos.', 400, parsed.error.format());
    }

    const { data, error } = await supabaseAdmin
      .from('medicamentos')
      .update(parsed.data)
      .eq('id', id)
      .eq('farmacia_id', farmaciaId)
      .select()
      .single();

    if (error) throw new AppError(`Erro ao actualizar: ${error.message}`, 500);
    return data;
  },

  // ── REMOVER medicamento (soft delete — marca como inativo) ────────────────
  async remover(id, farmaciaId) {
    await this._verificarPropriedade(id, farmaciaId);

    const { error } = await supabaseAdmin
      .from('medicamentos')
      .update({ ativo: false })
      .eq('id', id)
      .eq('farmacia_id', farmaciaId);

    if (error) throw new AppError(`Erro ao remover medicamento: ${error.message}`, 500);
    return { success: true };
  },

  // ── ALERTAS de stock crítico (abaixo do mínimo) ───────────────────────────
  async alertasCriticos(farmaciaId) {
    const { data, error } = await supabaseAdmin
      .from('medicamentos')
      .select('id, nome, dosagem, stock_atual, stock_minimo, stock_nivel')
      .eq('farmacia_id', farmaciaId)
      .eq('ativo', true)
      .in('stock_nivel', ['critico', 'baixo'])
      .order('stock_atual', { ascending: true });

    if (error) throw new AppError('Erro ao carregar alertas.', 500);
    return data;
  },

  // ── VERIFICAR que o medicamento pertence à farmácia ───────────────────────
  async _verificarPropriedade(id, farmaciaId) {
    const { data } = await supabaseAdmin
      .from('medicamentos')
      .select('id')
      .eq('id', id)
      .eq('farmacia_id', farmaciaId)
      .single();

    if (!data) throw new AppError('Medicamento não encontrado nesta farmácia.', 404);
  },
};
