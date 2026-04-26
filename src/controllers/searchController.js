// src/controllers/searchController.js
// Pesquisa de medicamentos por nome com ordenação por proximidade quando houver coordenadas.

import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';

function parseCoordinate(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeLike(value) {
  return value.replace(/[%_,]/g, (char) => `\\${char}`);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function calcularDistanciaKm(origLat, origLng, destLat, destLng) {
  if ([origLat, origLng, destLat, destLng].some((value) => value === null)) {
    return null;
  }

  const earthRadiusKm = 6371;
  const latDiff = toRadians(destLat - origLat);
  const lngDiff = toRadians(destLng - origLng);
  const a = Math.sin(latDiff / 2) ** 2
    + Math.cos(toRadians(origLat))
    * Math.cos(toRadians(destLat))
    * Math.sin(lngDiff / 2) ** 2;

  return Number((earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

function normalizarTexto(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function calcularStockNivel(stockAtual, stockMinimo, nivelActual) {
  if (nivelActual) return nivelActual;
  if (!Number.isFinite(stockAtual)) return 'ok';
  if (!Number.isFinite(stockMinimo) || stockMinimo <= 0) {
    return stockAtual <= 0 ? 'critico' : 'ok';
  }
  if (stockAtual <= stockMinimo) return 'critico';
  if (stockAtual <= stockMinimo * 1.5) return 'baixo';
  return 'ok';
}

export const searchController = {

  // GET /api/v1/search?q=paracetamol&lat=-25.96&lng=32.58&raio=10
  async search(req, res, next) {
    try {
      const { q, lat, lng, raio = 10, limite = 20 } = req.query;

      if (!q || q.trim().length < 2) {
        throw new AppError('Parâmetro de pesquisa "q" deve ter pelo menos 2 caracteres.', 400);
      }

      const query = q.trim();
      const normalizedQuery = normalizarTexto(query);
      const latNum = parseCoordinate(lat);
      const lngNum = parseCoordinate(lng);
      const raioNum = Math.min(Number.parseFloat(raio) || 10, 50);
      const limNum = Math.min(Number.parseInt(limite, 10) || 20, 50);
      const likeValue = `%${escapeLike(query)}%`;

      const { data, error } = await supabaseAdmin
        .from('medicamentos')
        .select(`
          id,
          nome,
          nome_generico,
          dosagem,
          categoria,
          preco_mt,
          stock_atual,
          stock_minimo,
          stock_nivel,
          requer_receita,
          farmacias!inner(
            id,
            nome,
            morada,
            telefone,
            latitude,
            longitude,
            activa
          )
        `)
        .eq('ativo', true)
        .gt('stock_atual', 0)
        .eq('farmacias.activa', true)
        .or(`nome.ilike.${likeValue},nome_generico.ilike.${likeValue},dosagem.ilike.${likeValue}`)
        .limit(Math.min(limNum * 5, 100));

      if (error) {
        throw new AppError(
          `Erro na pesquisa: ${error.message || 'Falha no Supabase.'}`,
          500,
          { supabase: error }
        );
      }

      const results = (data || [])
        .map((row) => {
          const farmacia = Array.isArray(row.farmacias) ? row.farmacias[0] : row.farmacias;
          const farmaciaLat = parseCoordinate(farmacia?.latitude);
          const farmaciaLng = parseCoordinate(farmacia?.longitude);
          const distanciaKm = calcularDistanciaKm(latNum, lngNum, farmaciaLat, farmaciaLng);
          const nomeNormalizado = normalizarTexto(row.nome);
          const genericoNormalizado = normalizarTexto(row.nome_generico);
          const dosagemNormalizada = normalizarTexto(row.dosagem);
          const startsWithQuery = [
            nomeNormalizado,
            genericoNormalizado,
            dosagemNormalizada,
          ].some((value) => value.startsWith(normalizedQuery));
          const containsQuery = [
            nomeNormalizado,
            genericoNormalizado,
            dosagemNormalizada,
          ].some((value) => value.includes(normalizedQuery));

          return {
            medicamento: {
              id: row.id,
              nome: row.nome,
              dosagem: row.dosagem,
              categoria: row.categoria,
              preco_mt: Number(row.preco_mt),
              stock_atual: row.stock_atual,
              stock_nivel: calcularStockNivel(row.stock_atual, row.stock_minimo, row.stock_nivel),
              requer_receita: row.requer_receita,
            },
            farmacia: {
              id: farmacia?.id,
              nome: farmacia?.nome,
              morada: farmacia?.morada,
              tel: farmacia?.telefone,
              lat: farmaciaLat,
              lng: farmaciaLng,
              distancia_km: distanciaKm,
            },
            _rank: {
              startsWithQuery,
              containsQuery,
              distanciaKm: distanciaKm ?? Number.MAX_SAFE_INTEGER,
              stockAtual: row.stock_atual ?? 0,
              nome: nomeNormalizado,
            },
          };
        })
        .filter((row) => row.farmacia.id)
        .filter((row) => row._rank.containsQuery)
        .filter((row) => latNum === null || lngNum === null || row.farmacia.distancia_km === null || row.farmacia.distancia_km <= raioNum)
        .sort((a, b) => {
          if (a._rank.startsWithQuery !== b._rank.startsWithQuery) {
            return a._rank.startsWithQuery ? -1 : 1;
          }
          if (a._rank.distanciaKm !== b._rank.distanciaKm) {
            return a._rank.distanciaKm - b._rank.distanciaKm;
          }
          if (a._rank.stockAtual !== b._rank.stockAtual) {
            return b._rank.stockAtual - a._rank.stockAtual;
          }
          return a._rank.nome.localeCompare(b._rank.nome, 'pt');
        })
        .slice(0, limNum)
        .map(({ _rank, ...result }) => result);

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
