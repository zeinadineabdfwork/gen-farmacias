// src/services/reservaService.js
import { supabaseAdmin } from '../config/supabase.js';
import { generateCode } from '../utils/generateCode.js';
import { createFingerprint } from '../utils/fingerprint.js';
import { AppError } from '../middleware/errorHandler.js';
 
export const reservaService = {
 
  async criar(data) {
    const {
      farmacia_id, itens, cliente_nome, cliente_tel,
      receita_url, receita_path,
      ip, user_agent, origin, timestamp
    } = data;
 
    // 1. Verificar que a farmácia existe e está activa
    console.log('DEBUG: Procurando farmácia com ID:', farmacia_id, 'Type:', typeof farmacia_id);
    const { data: farmacia, error: fErr } = await supabaseAdmin
      .from('farmacias')
      .select('id, nome')
      .eq('id', farmacia_id)
      .single();
    console.log('DEBUG: Resultado da busca - Farmácia:', farmacia, 'Erro:', fErr);
    if (fErr || !farmacia) throw new AppError(`Farmácia não encontrada. ID: ${farmacia_id}. Erro: ${fErr?.message}`, 404);
 
    // 2. Verificar stock disponível para cada item
    for (const item of itens) {
      const { data: med } = await supabaseAdmin
        .from('medicamentos')
        .select('id, nome, stock_atual, preco_mt')
        .eq('id', item.medicamento_id)
        .eq('farmacia_id', farmacia_id)
        .single();
      if (!med) throw new AppError(`Medicamento ${item.nome} não encontrado.`, 404);
      if (med.stock_atual < item.qty)
        throw new AppError(`Stock insuficiente para ${med.nome}.`, 409);
      // Snapshot do preço actual (protege contra alterações)
      item.preco_unitario = med.preco_mt;
    }
 
    // 3. Calcular total
    const total_mt = itens.reduce((sum, i) => sum + i.preco_unitario * i.qty, 0);
 
    // 4. Gerar código único FF-XXXX
    const codigo = await generateCode();
 
    // 5. Criar fingerprint de segurança
    const hash_fingerprint = createFingerprint(ip, cliente_tel, timestamp);
 
    // 6. Inserir na base de dados (via service_role — ignora RLS)
    const { data: reserva, error } = await supabaseAdmin
      .from('reservas')
      .insert({
        codigo,
        farmacia_id,
        cliente_nome: cliente_nome.trim(),
        cliente_tel:  cliente_tel.trim(),
        itens,
        total_mt,
        receita_url,
        receita_path,
        cliente_ip:      ip,
        user_agent,
        hash_fingerprint,
        metadata: { origin, referrer: data.referer },
      })
      .select()
      .single();
 
    if (error) {
      console.error('Supabase Insert Error:', error);
      throw new AppError(`Erro ao criar reserva: ${error.message}`, 500);
    }
 
    return { ...reserva, farmacia_nome: farmacia.nome };
  },
 
  async checkSpam(ip) {
    const { count } = await supabaseAdmin
      .from('reservas')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_ip', ip)
      .gte('criada_em', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    return { isSpam: count >= 3 };
  },
 
  async marcarPago(reservaId, userId, farmaciaId) {
    // Verifica que a reserva pertence à farmácia do utilizador
    const { data: reserva } = await supabaseAdmin
      .from('reservas')
      .select('id, status, farmacia_id')
      .eq('id', reservaId)
      .eq('farmacia_id', farmaciaId)
      .single();
 
    if (!reserva) throw new AppError('Reserva não encontrada.', 404);
    if (reserva.status !== 'pendente') throw new AppError('Esta reserva já foi processada.', 409);
 
    // O trigger SQL "abater_stock_reserva" é executado automaticamente
    const { data, error } = await supabaseAdmin
      .from('reservas')
      .update({ status: 'pago', pago_por: userId })
      .eq('id', reservaId)
      .select()
      .single();
 
    if (error) throw new AppError(error.message, 500);
    return data;
  },
 
  async gerarUrlReceita(reservaId, farmaciaId) {
    const { data: reserva } = await supabaseAdmin
      .from('reservas')
      .select('receita_path')
      .eq('id', reservaId)
      .eq('farmacia_id', farmaciaId)
      .single();
 
    if (!reserva?.receita_path) throw new AppError('Sem receita disponível.', 404);
 
    // URL assinada: válida apenas 15 minutos
    const { data, error } = await supabaseAdmin
      .storage
      .from('receitas')
      .createSignedUrl(reserva.receita_path, 900);
 
    if (error) throw new AppError('Erro ao gerar URL.', 500);
    return data.signedUrl;
  },
};
