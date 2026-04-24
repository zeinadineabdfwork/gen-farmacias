// src/middleware/authGuard.js
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from './errorHandler.js';
 
export async function authGuard(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Token de autenticação em falta.', 401);
    }
 
    const token = authHeader.split(' ')[1];
 
    // Validar JWT com o Supabase Auth
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) throw new AppError('Token inválido ou expirado.', 401);
 
    // Buscar a farmácia associada ao utilizador
    const { data: farmacia, error: fErr } = await supabaseAdmin
      .from('farmacias')
      .select('id, nome')
      .eq('user_id', user.id)
      .single();
 
    if (fErr || !farmacia) {
      throw new AppError('Utilizador não associado a nenhuma farmácia.', 403);
    }
 
    // Injectar dados no request para uso nos controllers
    req.user       = user;
    req.farmacia_id = farmacia.id;
    req.farmacia_nome = farmacia.nome;
    next();
 
  } catch (err) {
    next(err);
  }
}
