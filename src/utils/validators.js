// src/utils/validators.js
import { z } from 'zod';

export const reservaSchema = z.object({
  farmacia_id: z.string().uuid({ message: 'ID de farmácia inválido.' }),

  cliente_nome: z
    .string()
    .min(3,   { message: 'Nome muito curto.' })
    .max(100, { message: 'Nome muito longo.' })
    .regex(/^[a-zA-ZÀ-ÿ\s]+$/, { message: 'Nome contém caracteres inválidos.' })
    .transform(s => s.trim()),

  // Aceita números mozambicanos: 82-87 + 7 dígitos, com ou sem prefixo +258/258
  cliente_tel: z
    .string()
    .regex(/^(\+258|258)?(8[2-7])\d{7}$/, {
      message: 'Número mozambicano inválido. Ex: 841234567 ou +258841234567',
    })
    .transform(s => s.replace(/^(\+258|258)/, '')), // Normalizar para 9 dígitos

  itens: z
    .array(z.object({
      medicamento_id: z.string().uuid({ message: 'ID de medicamento inválido.' }),
      nome:           z.string().min(1),
      qty:            z.number().int().min(1).max(20),
    }))
    .min(1,  { message: 'A reserva deve ter pelo menos 1 item.' })
    .max(10, { message: 'Máximo de 10 itens por reserva.' }),
});

export const medicamentoSchema = z.object({
  nome:           z.string().min(2).max(200),
  nome_generico:  z.string().max(200).optional().nullable(),
  categoria:      z.string().min(2).max(100),
  descricao:      z.string().max(500).optional().nullable(),
  dosagem:        z.string().max(50).optional().nullable(),
  forma_farmac:   z.string().max(50).optional().nullable(),
  preco_mt:       z.number().positive({ message: 'Preço deve ser positivo.' }),
  stock_atual:    z.number().int().min(0),
  stock_minimo:   z.number().int().min(0, { message: 'Mínimo de stock não pode ser negativo.' }),
  requer_receita: z.boolean().default(false),
});
