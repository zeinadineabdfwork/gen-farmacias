import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { stockService } from '../services/stockService.js';
import { uploadBase64 } from '../services/uploadService.js';
import { AppError } from '../middleware/errorHandler.js';

function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatWeekday(date) {
  return date.toLocaleDateString('pt-MZ', { weekday: 'short' })
    .replace('.', '')
    .replace(/^\w/, (char) => char.toUpperCase());
}

function normalizarTopProdutos(reservas = []) {
  const counter = new Map();

  for (const reserva of reservas) {
    const itens = Array.isArray(reserva.itens) ? reserva.itens : [];

    for (const item of itens) {
      const medicamentoId = item?.medicamento_id || item?.nome;
      if (!medicamentoId) continue;

      const qty = Number(item.qty) || 0;
      const total = Number(item.preco_unitario || 0) * qty;
      const key = String(medicamentoId);
      const current = counter.get(key) || {
        medicamento_id: item?.medicamento_id || null,
        nome: item?.nome || 'Medicamento',
        unidades_vendidas: 0,
        receita_total: 0,
      };

      current.unidades_vendidas += qty;
      current.receita_total += total;
      counter.set(key, current);
    }
  }

  return Array.from(counter.values())
    .sort((a, b) => {
      if (b.unidades_vendidas !== a.unidades_vendidas) {
        return b.unidades_vendidas - a.unidades_vendidas;
      }
      return b.receita_total - a.receita_total;
    })
    .slice(0, 10);
}

export const farmaciaController = {
  // GET /api/v1/farmacia/dashboard
  async dashboard(req, res, next) {
    try {
      const fid = req.farmacia_id;
      if (!fid) throw new AppError('ID da farmácia não encontrado na sessão.', 401);

      const todayStart = startOfDay();
      const weekStart = startOfDay(new Date(todayStart));
      weekStart.setDate(weekStart.getDate() - 6);

      const monthStart = startOfDay(new Date(todayStart));
      monthStart.setDate(monthStart.getDate() - 29);

      const [reservasHoje, reservasSemana, reservasMes, medicamentos, alertas] = await Promise.all([
        supabaseAdmin
          .from('reservas')
          .select('id, status, total_mt, criada_em')
          .eq('farmacia_id', fid)
          .gte('criada_em', todayStart.toISOString()),

        supabaseAdmin
          .from('reservas')
          .select('id, codigo, status, total_mt, criada_em, cliente_nome, cliente_tel, itens')
          .eq('farmacia_id', fid)
          .gte('criada_em', weekStart.toISOString())
          .order('criada_em', { ascending: false }),

        supabaseAdmin
          .from('reservas')
          .select('id, status, total_mt, criada_em, itens')
          .eq('farmacia_id', fid)
          .eq('status', 'pago')
          .gte('criada_em', monthStart.toISOString()),

        supabaseAdmin
          .from('medicamentos')
          .select('id, stock_nivel', { count: 'exact' })
          .eq('farmacia_id', fid)
          .eq('ativo', true),

        stockService.alertasCriticos(fid),
      ]);

      if (reservasHoje.error) throw new AppError('Erro ao carregar reservas de hoje.', 500);
      if (reservasSemana.error) throw new AppError('Erro ao carregar reservas da semana.', 500);
      if (reservasMes.error) throw new AppError('Erro ao carregar vendas do mês.', 500);
      if (medicamentos.error) throw new AppError('Erro ao carregar stock do dashboard.', 500);

      const reservasHojeData = reservasHoje.data || [];
      const reservasSemanaData = reservasSemana.data || [];
      const reservasMesData = reservasMes.data || [];
      const medicamentosData = medicamentos.data || [];

      const totalHoje = reservasHojeData.reduce((sum, reserva) => sum + Number(reserva.total_mt || 0), 0);
      const pendentesHoje = reservasHojeData.filter((reserva) => reserva.status === 'pendente').length;
      const pagasHoje = reservasHojeData.filter((reserva) => reserva.status === 'pago').length;
      const criticos = medicamentosData.filter((med) => med.stock_nivel === 'critico').length;
      const baixos = medicamentosData.filter((med) => med.stock_nivel === 'baixo').length;

      const dailyMap = new Map();
      for (let offset = 0; offset < 7; offset += 1) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + offset);
        const key = date.toISOString().slice(0, 10);
        dailyMap.set(key, {
          label: formatWeekday(date),
          data: key,
          reservas: 0,
          pagos: 0,
          total_mt: 0,
        });
      }

      for (const reserva of reservasSemanaData) {
        const key = new Date(reserva.criada_em).toISOString().slice(0, 10);
        const bucket = dailyMap.get(key);
        if (!bucket) continue;
        bucket.reservas += 1;
        bucket.total_mt += Number(reserva.total_mt || 0);
        if (reserva.status === 'pago') bucket.pagos += 1;
      }

      const serieSemanal = Array.from(dailyMap.values());
      const reservasSemanaTotal = reservasSemanaData.length;
      const faturacaoSemana = reservasSemanaData
        .filter((reserva) => reserva.status === 'pago')
        .reduce((sum, reserva) => sum + Number(reserva.total_mt || 0), 0);

      const recentWeekReservas = reservasSemanaData.slice(0, 7).map((reserva) => ({
        id: reserva.id,
        codigo: reserva.codigo,
        cliente_nome: reserva.cliente_nome,
        cliente_tel: reserva.cliente_tel,
        status: reserva.status,
        criada_em: reserva.criada_em,
        total_mt: Number(reserva.total_mt || 0),
        itens_resumo: (Array.isArray(reserva.itens) ? reserva.itens : [])
          .slice(0, 3)
          .map((item) => `${item.qty}x ${item.nome}`)
          .join(', '),
      }));

      const topProdutos = normalizarTopProdutos(reservasMesData);

      res.json({
        success: true,
        dashboard: {
          farmacia_id: fid,
          reservas_hoje: reservasHojeData.length,
          pendentes: pendentesHoje,
          pagas: pagasHoje,
          total_mt_hoje: totalHoje,
          total_medicamentos: medicamentos.count || 0,
          stock_critico: criticos,
          stock_baixo: baixos,
          reservas_semana: reservasSemanaTotal,
          faturacao_semana: faturacaoSemana,
          alertas: (alertas || []).slice(0, 6),
          week_series: serieSemanal,
          reservas_recentes_semana: recentWeekReservas,
          top_produtos: topProdutos,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cadastrar-farmacia
  async cadastrar(req, res, next) {
    try {
      const {
        nome, slug, nuit, email, tel, whatsapp, cidade, morada, lat, lon,
        logo_base64, horarios, servicos, notas,
      } = req.body;

      if (!nome || !slug || !nuit || !email || !tel || !cidade || !morada) {
        throw new AppError('Campos obrigatórios em falta.', 400);
      }

      const password = req.body.password && req.body.password.length >= 8
        ? req.body.password
        : Math.random().toString(36).slice(-12) + 'Aa1!';

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        const isDuplicateEmail = authError.message?.includes('already been registered');
        const message = isDuplicateEmail
          ? 'Este email já está registrado. Faça login ou use outro email.'
          : `Erro ao criar conta: ${authError.message}`;
        throw new AppError(message, isDuplicateEmail ? 409 : 400);
      }

      const userId = authData.user.id;

      let logo_url = null;
      if (logo_base64) {
        try {
          logo_url = await uploadBase64(logo_base64, env.STORAGE_BUCKET_LOGOS);
        } catch (error) {
          console.error('Erro ao fazer upload do logo:', error.message);
        }
      }

      const farmaciaData = {
        user_id: userId,
        nome,
        slug,
        email,
        telefone: tel,
        whatsapp: whatsapp || null,
        cidade,
        morada,
        latitude: lat ? parseFloat(lat) : 0,
        longitude: lon ? parseFloat(lon) : 0,
        horario_abertura: horarios.abertura,
        horario_fecho: horarios.fecho,
        dias_funcionamento: horarios.dias || ['seg', 'ter', 'qua', 'qui', 'sex'],
        activa: servicos.activa !== false,
        notas: notas || null,
        logo_url,
      };

      const { data: farmacia, error: farmErr } = await supabaseAdmin
        .from('farmacias')
        .insert(farmaciaData)
        .select('id')
        .single();

      if (farmErr) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new AppError(`Erro ao cadastrar farmácia: ${farmErr.message}`, 500);
      }

      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });
      if (sessionError) throw new AppError('Conta criada, mas erro no login automático.', 500);

      res.status(201).json({
        success: true,
        message: 'Farmácia cadastrada com sucesso!',
        farmacia_id: farmacia.id,
        temp_password: password,
        session: {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/farmacia/medicamentos
  async listarMedicamentos(req, res, next) {
    try {
      const { inclui_inativos } = req.query;
      const data = await stockService.listar(req.farmacia_id, {
        incluiInativos: inclui_inativos === 'true',
      });
      res.json({ success: true, medicamentos: data || [] });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/farmacia/medicamentos
  async criarMedicamento(req, res, next) {
    try {
      const med = await stockService.criar(req.farmacia_id, req.body);
      res.status(201).json({ success: true, medicamento: med });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/farmacia/medicamentos/:id
  async atualizarMedicamento(req, res, next) {
    try {
      if (!req.params.id) throw new AppError('ID do medicamento é obrigatório.', 400);

      const med = await stockService.actualizar(req.params.id, req.farmacia_id, req.body);
      res.json({ success: true, medicamento: med });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/farmacia/medicamentos/:id
  async removerMedicamento(req, res, next) {
    try {
      await stockService.remover(req.params.id, req.farmacia_id);
      res.json({ success: true, message: 'Medicamento removido com sucesso.' });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/farmacia/alertas
  async alertasStock(req, res, next) {
    try {
      const alertas = await stockService.alertasCriticos(req.farmacia_id);
      res.json({ success: true, alertas: alertas || [] });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/farmacia/perfil
  async atualizarPerfil(req, res, next) {
    try {
      const ALLOWED_FIELDS = ['telefone', 'whatsapp', 'email', 'horario_abertura', 'horario_fecho', 'dias_funcionamento'];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => ALLOWED_FIELDS.includes(key))
      );

      if (!Object.keys(updates).length) {
        throw new AppError('Nenhum campo válido para atualização foi fornecido.', 400);
      }

      const { data, error } = await supabaseAdmin
        .from('farmacias')
        .update(updates)
        .eq('id', req.farmacia_id)
        .select()
        .single();

      if (error) throw new AppError('Erro ao atualizar perfil na base de dados.', 500);
      res.json({ success: true, farmacia: data });
    } catch (err) {
      next(err);
    }
  },
};
