import { reservaService } from '../services/reservaService.js';
import { uploadReceitaToStorage } from '../services/uploadService.js';
import { reservaSchema } from '../utils/validators.js';
import { AppError } from '../middleware/errorHandler.js';

export const reservaController = {

  // POST /api/v1/reservar
  async criar(req, res, next) {
    try {
      // 1. Preparar dados: parse itens JSON
      const data = { ...req.body };
      if (data.itens) {
        try {
          data.itens = JSON.parse(data.itens);
        } catch {
          throw new AppError('Itens da reserva inválidos.', 400);
        }
      }

      // 2. Validar dados de entrada com Zod
      const parsed = reservaSchema.safeParse(data);
      if (!parsed.success) {
        throw new AppError('Dados de entrada inválidos.', 400, parsed.error.format());
      }

      // 2. Extrair metadados de segurança da request
      const securityMeta = {
        ip:         req.ip,
        user_agent: req.headers['user-agent'] || 'unknown',
        origin:     req.headers.origin,
        referer:    req.headers['referer'],
        timestamp:  Date.now(),
      };

      // 3. Verificar spam: máx 3 reservas por IP nas últimas 2h
      const spamCheck = await reservaService.checkSpam(req.ip);
      if (spamCheck.isSpam) {
        throw new AppError('Limite de reservas atingido. Tente mais tarde.', 429);
      }

      // 4. Fazer upload da receita (se enviada)
      // Corrigido: chamar uploadReceitaToStorage directamente de uploadService
      let receita_url = null, receita_path = null;
      if (req.file) {
        const codigo_temp = `TEMP_${Date.now()}`;
        const uploadResult = await uploadReceitaToStorage(req.file, codigo_temp);
        receita_url  = uploadResult.publicUrl;
        receita_path = uploadResult.path;
      }

      // 5. Criar a reserva (gera código FF-XXXX + guarda tudo)
      const reserva = await reservaService.criar({
        ...parsed.data,
        receita_url,
        receita_path,
        ...securityMeta,
      });

      // 6. Resposta mínima ao cliente (nunca retornar IP/metadata)
      res.status(201).json({
        success:   true,
        codigo:    reserva.codigo,
        expira_em: reserva.expira_em,
        farmacia:  reserva.farmacia_nome,
        total_mt:  reserva.total_mt,
      });

    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/reservas/:codigo
  // Utente consulta a sua reserva pelo código FF-XXXX
  async consultar(req, res, next) {
    try {
      const { codigo } = req.params;
      if (!codigo) throw new AppError('Código de reserva obrigatório.', 400);

      const { data, error } = await (await import('../config/supabase.js')).supabaseAdmin
        .from('reservas')
        .select('codigo, status, total_mt, expira_em, criada_em, itens, farmacia_id, farmacias(nome, telefone, morada)')
        .eq('codigo', codigo.toUpperCase())
        .single();

      if (error || !data) throw new AppError('Reserva não encontrada.', 404);

      // Nunca retornar dados sensíveis (IP, user_agent, fingerprint)
      res.json({
        success: true,
        reserva: {
          codigo:    data.codigo,
          status:    data.status,
          total_mt:  data.total_mt,
          expira_em: data.expira_em,
          criada_em: data.criada_em,
          itens:     data.itens,
          farmacia:  data.farmacias,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/farmacia/reservas/:id/pagar
  async marcarPago(req, res, next) {
    try {
      const { id } = req.params;
      const resultado = await reservaService.marcarPago(id, req.user.id, req.farmacia_id);
      res.json({ success: true, reserva: resultado });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/farmacia/reservas/:id/cancelar
  async cancelar(req, res, next) {
    try {
      const { id } = req.params;

      const { supabaseAdmin } = await import('../config/supabase.js');

      // Verificar que a reserva pertence à farmácia autenticada
      const { data: reserva } = await supabaseAdmin
        .from('reservas')
        .select('id, status, farmacia_id')
        .eq('id', id)
        .eq('farmacia_id', req.farmacia_id)
        .single();

      if (!reserva) throw new AppError('Reserva não encontrada.', 404);
      if (reserva.status === 'pago') throw new AppError('Não é possível cancelar uma reserva já paga.', 409);
      if (reserva.status === 'cancelado') throw new AppError('Esta reserva já foi cancelada.', 409);

      const { data, error } = await supabaseAdmin
        .from('reservas')
        .update({ status: 'cancelado', cancelado_por: req.user.id })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new AppError('Erro ao cancelar reserva.', 500);
      res.json({ success: true, reserva: data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/farmacia/reservas
  async listarPorFarmacia(req, res, next) {
    try {
      const { status, data_inicio, data_fim } = req.query;
      const { supabaseAdmin } = await import('../config/supabase.js');

      let query = supabaseAdmin
        .from('reservas')
        .select('*')
        .eq('farmacia_id', req.farmacia_id)
        .order('criada_em', { ascending: false });

      if (status) query = query.eq('status', status);
      if (data_inicio) query = query.gte('criada_em', data_inicio);
      if (data_fim) query = query.lte('criada_em', data_fim);

      const { data, error } = await query;
      if (error) throw new AppError('Erro ao carregar reservas.', 500);
      res.json({ success: true, reservas: data || [] });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/farmacia/reservas/:id/receita
  async verReceita(req, res, next) {
    try {
      const url = await reservaService.gerarUrlReceita(req.params.id, req.farmacia_id);
      res.json({ url, expira_em: Date.now() + 15 * 60 * 1000 });
    } catch (err) {
      next(err);
    }
  },
};
