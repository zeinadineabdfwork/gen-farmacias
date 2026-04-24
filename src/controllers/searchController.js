// src/controllers/searchController.js
// Pesquisa de medicamentos por nome + proximidade geográfica.

import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';

export const searchController = {

  // GET /api/v1/search?q=paracetamol&lat=-25.96&lng=32.58&raio=10
  async search(req, res, next) {
    try {
      const { q, lat, lng, raio = 10, limite = 20 } = req.query;

      if (!q || q.trim().length < 2) {
        throw new AppError('Parâmetro de pesquisa "q" deve ter pelo menos 2 caracteres.', 400);
      }

      const latNum  = parseFloat(lat);
      const lngNum  = parseFloat(lng);
      const raioNum = Math.min(parseFloat(raio) || 10, 50); // máx 50 km
      const limNum  = Math.min(parseInt(limite) || 20, 50);

      // Verificar coordenadas válidas (obrigatórias)
      if (isNaN(latNum) || isNaN(lngNum)) {
        throw new AppError('Coordenadas "lat" e "lng" são obrigatórias e devem ser numéricas.', 400);
      }

      // Chamar a função SQL de pesquisa geoespacial
      const { data, error } = await supabaseAdmin.rpc('pesquisar_medicamentos', {
        p_query:   q.trim(),
        p_lat:     latNum,
        p_lng:     lngNum,
        p_raio_km: raioNum,
        p_limite:  limNum,
      });

      if (error) {
        throw new AppError(
          `Erro na pesquisa: ${error.message || 'Falha no Supabase RPC.'}`,
          500,
          { supabase: error }
        );
      }

      // Mapear para o formato que o frontend espera
      const results = (data || []).map((row) => ({
        medicamento: {
          id:             row.medicamento_id,
          nome:           row.medicamento_nome,
          dosagem:        row.dosagem,
          categoria:      row.categoria,
          preco_mt:       Number(row.preco_mt),
          stock_atual:    row.stock_atual,
          stock_nivel:    row.stock_nivel,
          requer_receita: row.requer_receita,
        },
        farmacia: {
          id:      row.farmacia_id,
          nome:    row.farmacia_nome,
          morada:  row.farmacia_morada,
          tel:     row.farmacia_tel,
          lat:     Number(row.farmacia_lat),
          lng:     Number(row.farmacia_lng),
          distancia_km: Number(row.distancia_km),
        },
      }));

      res.json({ success: true, total: results.length, results });

    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/farmacias
  async listFarmacias(req, res, next) {
    try {
      const { data, error } = await supabaseAdmin
        .from('farmacias')
        .select('id, nome, morada, cidade, latitude, longitude, telefone, horario_abertura, horario_fecho')
        .eq('activa', true)
        .order('nome');

      if (error) throw new AppError('Erro ao carregar farmácias.', 500);
      res.json({ success: true, farmacias: data });

    } catch (err) {
      next(err);
    }
  },
};
