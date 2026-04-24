// src/services/uploadService.js
// Trata do upload de fotos de receitas médicas para o Supabase Storage.
// Usa Multer em memória (sem disco) — o ficheiro é enviado directamente para o Storage.

import multer from 'multer';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';
import crypto from 'crypto';
import path from 'path';

// ── MULTER — Armazenamento em memória (buffer) ────────────────────────────────
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_BYTES      = 5 * 1024 * 1024; // 5 MB

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Tipo de ficheiro não permitido. Use JPG, PNG, WebP ou PDF.', 415));
    }
  },
});

// ── UPLOAD PARA SUPABASE STORAGE ─────────────────────────────────────────────
// Retorna { path, publicUrl }
export async function uploadReceitaToStorage(file, reservaCodigo) {
  if (!file) return { path: null, publicUrl: null };

  // Nome único: codigo_da_reserva + hash aleatório + extensão original
  const ext      = path.extname(file.originalname).toLowerCase() || '.jpg';
  const hash     = crypto.randomBytes(8).toString('hex');
  const filename = `${reservaCodigo}_${hash}${ext}`;
  const filePath = `receitas/${filename}`;

  const { error } = await supabaseAdmin
    .storage
    .from(env.STORAGE_BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false, // Nunca sobrescrever — cada receita é imutável
      cacheControl: '3600',
    });

  if (error) {
    throw new AppError(`Erro ao guardar receita: ${error.message}`, 500);
  }

  // URL assinada (privada) — o acesso é sempre gerado com validade limitada
  // A URL pública nunca é exposta directamente
  return {
    path:      filePath,
    publicUrl: null, // Nunca expor URL pública de receitas
  };
}

// ── GERAR URL ASSINADA (para a farmácia visualizar) ───────────────────────────
// Válida durante `expiresIn` segundos (padrão: 15 minutos)
export async function gerarUrlAssinada(filePath, expiresIn = 900) {
  const { data, error } = await supabaseAdmin
    .storage
    .from(env.STORAGE_BUCKET)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw new AppError('Erro ao gerar URL da receita.', 500);
  return data.signedUrl;
}

// ── UPLOAD BASE64 ────────────────────────────────────────────────────────────
// Para logos de farmácia (base64 do frontend)
export async function uploadBase64(base64Data, bucketName, folder = '') {
  if (!base64Data) return null;

  // Extrair mime type e dados
  const [mimePart, dataPart] = base64Data.split(',');
  const mimeType = mimePart.match(/data:([^;]+)/)[1];
  const buffer = Buffer.from(dataPart, 'base64');

  // Nome único
  const hash = crypto.randomBytes(8).toString('hex');
  const ext = mimeType.split('/')[1];
  const filename = `${hash}.${ext}`;
  const filePath = folder ? `${folder}/${filename}` : filename;

  const { error } = await supabaseAdmin
    .storage
    .from(bucketName)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    throw new AppError(`Erro ao guardar imagem: ${error.message}`, 500);
  }

  // Retornar URL pública para logos
  const { data: { publicUrl } } = supabaseAdmin
    .storage
    .from(bucketName)
    .getPublicUrl(filePath);

  return publicUrl;
}
