// src/controllers/farmaciaController.js
import { supabaseAdmin } from '../config/supabase.js';
import { stockService } from '../services/stockService.js';
import { uploadBase64 } from '../services/uploadService.js';
import { AppError } from '../middleware/errorHandler.js';

export const farmaciaController = {
  // GET /api/v1/farmacia/dashboard
  async dashboard(req, res, next) {
    try {
      const fid = req.farmacia_id;
      if (!fid) throw new AppError('ID da farmácia não encontrado na sessão.', 401);

      // Executar queries em paralelo
      const [reservasHoje, medicamentos, alertas] = await Promise.all([
        supabaseAdmin
          .from('reservas')
          .select('id, status, total_mt, criada_em')
          .eq('farmacia_id', fid)
          .gte('criada_em', new Date().toISOString().slice(0, 10)),
        
        supabaseAdmin
          .from('medicamentos')
          .select('id, stock_nivel', { count: 'exact' })
          .eq('farmacia_id', fid)
          .eq('ativo', true),

        stockService.alertasCriticos(fid),
      ]);

      // Validação de erro na linha 21 corrigida
      if (reservasHoje.error) throw new AppError('Erro ao carregar reservas do dashboard.', 500);
      if (medicamentos.error) throw new AppError('Erro ao carregar stock do dashboard.', 500);

      const reservas = reservasHoje.data || [];
      const totalHoje = reservas.reduce((s, r) => s + Number(r.total_mt || 0), 0);
      const criticos = (medicamentos.data || []).filter(m => m.stock_nivel === 'critico').length;

      res.json({
        success: true,
        dashboard: {
          reservas_hoje: reservas.length,
          total_mt_hoje: totalHoje,
          total_medicamentos: medicamentos.count || 0,
          stock_critico: criticos,
          alertas: (alertas || []).slice(0, 5), 
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
        logo_base64, horarios, servicos, notas
      } = req.body;

      // Validações básicas
      if (!nome || !slug || !nuit || !email || !tel || !cidade || !morada) {
        throw new AppError('Campos obrigatórios em falta.', 400);
      }

      const password = req.body.password && req.body.password.length >= 8
        ? req.body.password
        : Math.random().toString(36).slice(-12) + 'Aa1!';

      // Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,  // confirmar email automaticamente
      });
      if (authError) {
        const isDuplicateEmail = authError.message?.includes('already been registered');
        const message = isDuplicateEmail
          ? 'Este email já está registrado. Faça login ou use outro email.'
          : 'Erro ao criar conta: ' + authError.message;
        throw new AppError(message, isDuplicateEmail ? 409 : 400);
      }

      const userId = authData.user.id;

      // Upload do logo se fornecido
      let logo_url = null;
      if (logo_base64) {
        try {
          logo_url = await uploadBase64(logo_base64, env.STORAGE_BUCKET_LOGOS);
        } catch (e) {
          console.error('Erro ao fazer upload do logo:', e.message);
          // Continua sem o logo
        }
      }

      // Inserir farmácia
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
      };

      const { data: farmacia, error: farmErr } = await supabaseAdmin
        .from('farmacias')
        .insert(farmaciaData)
        .select('id')
        .single();

      if (farmErr) {
        // Se falhar, tentar remover o usuário criado
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw new AppError('Erro ao cadastrar farmácia: ' + farmErr.message, 500);
      }

      // Fazer login automático para retornar token
      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });
      if (sessionError) throw new AppError('Conta criada, mas erro no login automático.', 500);

      res.status(201).json({
        success: true,
        message: 'Farmácia cadastrada com sucesso!',
        farmacia_id: farmacia.id,
        temp_password: password,  // para debug, remover em prod
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
      // Linha 59: Garantindo que os parâmetros existam antes da chamada
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
        Object.entries(req.body).filter(([k]) => ALLOWED_FIELDS.includes(k))
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