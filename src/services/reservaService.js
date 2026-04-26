import { supabaseAdmin } from '../config/supabase.js';
import { generateCode } from '../utils/generateCode.js';
import { createFingerprint } from '../utils/fingerprint.js';
import { AppError } from '../middleware/errorHandler.js';

function calcularStockNivel(stockAtual, stockMinimo) {
  if (!Number.isFinite(stockAtual)) return 'ok';
  if (!Number.isFinite(stockMinimo) || stockMinimo <= 0) {
    return stockAtual <= 0 ? 'critico' : 'ok';
  }
  if (stockAtual <= stockMinimo) return 'critico';
  if (stockAtual <= stockMinimo * 1.5) return 'baixo';
  return 'ok';
}

function agregarItens(itens = []) {
  return itens.reduce((acc, item) => {
    const qty = Number(item.qty) || 0;
    if (!item?.medicamento_id || qty <= 0) return acc;

    const actual = acc.get(item.medicamento_id) || {
      medicamento_id: item.medicamento_id,
      nome: item.nome,
      qty: 0,
    };

    actual.qty += qty;
    acc.set(item.medicamento_id, actual);
    return acc;
  }, new Map());
}

export const reservaService = {

  async criar(data) {
    const {
      farmacia_id, itens, cliente_nome, cliente_tel,
      receita_url, receita_path,
      ip, user_agent, origin, timestamp,
    } = data;

    const { data: farmacia, error: fErr } = await supabaseAdmin
      .from('farmacias')
      .select('id, nome')
      .eq('id', farmacia_id)
      .single();

    if (fErr || !farmacia) {
      throw new AppError(`Farmácia não encontrada. ID: ${farmacia_id}. ${fErr?.message || ''}`.trim(), 404);
    }

    for (const item of itens) {
      const { data: med } = await supabaseAdmin
        .from('medicamentos')
        .select('id, nome, stock_atual, preco_mt')
        .eq('id', item.medicamento_id)
        .eq('farmacia_id', farmacia_id)
        .single();

      if (!med) throw new AppError(`Medicamento ${item.nome} não encontrado.`, 404);
      if (med.stock_atual < item.qty) {
        throw new AppError(`Stock insuficiente para ${med.nome}.`, 409);
      }

      item.preco_unitario = med.preco_mt;
    }

    const total_mt = itens.reduce((sum, item) => sum + item.preco_unitario * item.qty, 0);
    const codigo = await generateCode();
    const hash_fingerprint = createFingerprint(ip, cliente_tel, timestamp);

    const { data: reserva, error } = await supabaseAdmin
      .from('reservas')
      .insert({
        codigo,
        farmacia_id,
        cliente_nome: cliente_nome.trim(),
        cliente_tel: cliente_tel.trim(),
        itens,
        total_mt,
        receita_url,
        receita_path,
        cliente_ip: ip,
        user_agent,
        hash_fingerprint,
        metadata: { origin, referrer: data.referer },
      })
      .select()
      .single();

    if (error) {
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
    const { data: reserva } = await supabaseAdmin
      .from('reservas')
      .select('id, status, farmacia_id, itens')
      .eq('id', reservaId)
      .eq('farmacia_id', farmaciaId)
      .single();

    if (!reserva) throw new AppError('Reserva não encontrada.', 404);
    if (reserva.status !== 'pendente') throw new AppError('Esta reserva já foi processada.', 409);

    const itensAgrupados = Array.from(agregarItens(reserva.itens).values());
    if (!itensAgrupados.length) {
      throw new AppError('Reserva sem itens válidos para abater no stock.', 409);
    }

    const medicamentosIds = itensAgrupados.map((item) => item.medicamento_id);
    const { data: medicamentos, error: medsError } = await supabaseAdmin
      .from('medicamentos')
      .select('id, nome, stock_atual, stock_minimo, stock_nivel')
      .in('id', medicamentosIds)
      .eq('farmacia_id', farmaciaId);

    if (medsError) throw new AppError(`Erro ao carregar stock: ${medsError.message}`, 500);

    const medicamentosMap = new Map((medicamentos || []).map((med) => [med.id, med]));
    const actualizacoes = [];

    for (const item of itensAgrupados) {
      const med = medicamentosMap.get(item.medicamento_id);
      if (!med) throw new AppError(`Medicamento ${item.nome} não encontrado nesta farmácia.`, 404);
      if (Number(med.stock_atual) < item.qty) {
        throw new AppError(`Stock insuficiente para ${med.nome}.`, 409);
      }

      actualizacoes.push({
        id: med.id,
        nome: med.nome,
        stockAnterior: Number(med.stock_atual),
        stockMinimo: Number(med.stock_minimo),
        stockNovo: Number(med.stock_atual) - item.qty,
      });
    }

    const rollback = [];

    try {
      for (const update of actualizacoes) {
        const novoNivel = calcularStockNivel(update.stockNovo, update.stockMinimo);
        const { data: medicamentoAtualizado, error: updateError } = await supabaseAdmin
          .from('medicamentos')
          .update({
            stock_atual: update.stockNovo,
            stock_nivel: novoNivel,
          })
          .eq('id', update.id)
          .eq('farmacia_id', farmaciaId)
          .eq('stock_atual', update.stockAnterior)
          .select('id')
          .single();

        if (updateError || !medicamentoAtualizado) {
          throw new AppError(`Não foi possível actualizar o stock de ${update.nome}.`, 409);
        }

        rollback.push(update);
      }

      const { data, error } = await supabaseAdmin
        .from('reservas')
        .update({ status: 'pago', pago_por: userId })
        .eq('id', reservaId)
        .eq('status', 'pendente')
        .select()
        .single();

      if (error || !data) {
        throw new AppError(error?.message || 'Não foi possível marcar a reserva como paga.', 500);
      }

      return data;
    } catch (error) {
      for (const update of rollback.reverse()) {
        await supabaseAdmin
          .from('medicamentos')
          .update({
            stock_atual: update.stockAnterior,
            stock_nivel: calcularStockNivel(update.stockAnterior, update.stockMinimo),
          })
          .eq('id', update.id)
          .eq('farmacia_id', farmaciaId);
      }

      throw error;
    }
  },

  async gerarUrlReceita(reservaId, farmaciaId) {
    const { data: reserva } = await supabaseAdmin
      .from('reservas')
      .select('receita_path')
      .eq('id', reservaId)
      .eq('farmacia_id', farmaciaId)
      .single();

    if (!reserva?.receita_path) throw new AppError('Sem receita disponível.', 404);

    const { data, error } = await supabaseAdmin
      .storage
      .from('receitas')
      .createSignedUrl(reserva.receita_path, 900);

    if (error) throw new AppError('Erro ao gerar URL.', 500);
    return data.signedUrl;
  },
};
