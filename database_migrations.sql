-- ============================================================
-- MIGRAÇÕES SQL - Gen Farmácias
-- Execute estas queries no Supabase SQL Editor
-- ============================================================

-- 1. TABELA DE FARMÁCIAS (se não existir)
-- ============================================================
CREATE TABLE IF NOT EXISTS farmacias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT UNIQUE,
  nuit TEXT UNIQUE,
  email TEXT UNIQUE,
  tel TEXT,
  whatsapp TEXT,
  cidade TEXT,
  morada TEXT,
  lat DECIMAL,
  lon DECIMAL,
  logo_url TEXT,
  ativo BOOLEAN DEFAULT true,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE MEDICAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS medicamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmacia_id UUID NOT NULL REFERENCES farmacias(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  dosagem TEXT,
  descricao TEXT,
  stock_atual INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 100,
  stock_nivel TEXT DEFAULT 'ok', -- 'ok', 'baixo', 'critico'
  preco_unitario DECIMAL(10, 2) DEFAULT 0,
  requer_receita BOOLEAN DEFAULT false,
  ativo BOOLEAN DEFAULT true,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABELA DE RESERVAS
-- ============================================================
CREATE TABLE IF NOT EXISTS reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmacia_id UUID NOT NULL REFERENCES farmacias(id) ON DELETE CASCADE,
  codigo TEXT UNIQUE NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_tel TEXT,
  cliente_email TEXT,
  status TEXT DEFAULT 'pendente', -- 'pendente', 'pago', 'cancelado'
  total_mt DECIMAL(10, 2) DEFAULT 0,
  itens JSONB DEFAULT '[]', -- Array de {medicamento_id, nome, qty, preco_unitario}
  data_levantamento TIMESTAMP,
  notas TEXT,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABELA DE UTILIZADORES (ADMIN)
-- ============================================================
CREATE TABLE IF NOT EXISTS utilizadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmacia_id UUID NOT NULL REFERENCES farmacias(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'admin', -- 'admin', 'gerente', 'caixa'
  ativo BOOLEAN DEFAULT true,
  criada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actualizada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- DADOS DE EXEMPLO (Para testes/demonstração)
-- ============================================================

-- Inserir farmácia de teste
INSERT INTO farmacias (nome, slug, nuit, email, tel, whatsapp, cidade, morada, ativo)
VALUES (
  'Makinino Find Farmácia',
  'makinino-find',
  '000000000',
  'admin@makinino.mz',
  '+258 84 000 0000',
  '+258 84 000 0000',
  'Maputo',
  'Avenida Julius Nyerere, 1000',
  true
)
ON CONFLICT (email) DO NOTHING;

-- Obter ID da farmácia (usar em próximas queries)
-- Substitua <FARMACIA_ID> pelo ID retornado:
-- SELECT id FROM farmacias WHERE email = 'admin@makinino.mz';

-- ============================================================
-- INSERIR MEDICAMENTOS DE EXEMPLO
-- ============================================================
-- NOTA: Substitua <FARMACIA_ID> pelo UUID da sua farmácia
INSERT INTO medicamentos (
  farmacia_id,
  nome,
  dosagem,
  stock_atual,
  stock_minimo,
  stock_nivel,
  preco_unitario,
  requer_receita,
  ativo
)
VALUES
(
  '<FARMACIA_ID>',
  'Amoxicilina',
  '500mg',
  250,
  100,
  'ok',
  150.00,
  true,
  true
),
(
  '<FARMACIA_ID>',
  'Paracetamol',
  '500mg',
  50,
  100,
  'critico',
  75.00,
  false,
  true
),
(
  '<FARMACIA_ID>',
  'Ibuprofen',
  '400mg',
  80,
  100,
  'baixo',
  90.00,
  false,
  true
),
(
  '<FARMACIA_ID>',
  'Cetirizina',
  '10mg',
  200,
  100,
  'ok',
  120.00,
  false,
  true
),
(
  '<FARMACIA_ID>',
  'Omeprazol',
  '20mg',
  150,
  100,
  'ok',
  200.00,
  true,
  true
),
(
  '<FARMACIA_ID>',
  'Antibiótico',
  '250mg',
  120,
  100,
  'ok',
  180.00,
  true,
  true
),
(
  '<FARMACIA_ID>',
  'Vitamina C',
  '1000mg',
  300,
  100,
  'ok',
  95.00,
  false,
  true
),
(
  '<FARMACIA_ID>',
  'Dipirona',
  '500mg',
  45,
  100,
  'critico',
  65.00,
  false,
  true
);

-- ============================================================
-- INSERIR RESERVAS DE EXEMPLO (últimos 7 dias)
-- ============================================================
-- Hoje
INSERT INTO reservas (
  farmacia_id,
  codigo,
  cliente_nome,
  cliente_tel,
  status,
  total_mt,
  itens,
  criada_em
)
VALUES
(
  '<FARMACIA_ID>',
  'RES-20260525-001',
  'João Silva',
  '+258 84 123 4567',
  'pago',
  425.00,
  '[{"medicamento_id": "med-1", "nome": "Amoxicilina 500mg", "qty": 1, "preco_unitario": 150}, {"medicamento_id": "med-4", "nome": "Cetirizina 10mg", "qty": 2, "preco_unitario": 120}]',
  CURRENT_TIMESTAMP
),
(
  '<FARMACIA_ID>',
  'RES-20260525-002',
  'Maria Santos',
  '+258 82 987 6543',
  'pendente',
  600.00,
  '[{"medicamento_id": "med-5", "nome": "Omeprazol 20mg", "qty": 2, "preco_unitario": 200}, {"medicamento_id": "med-7", "nome": "Vitamina C", "qty": 1, "preco_unitario": 95}]',
  CURRENT_TIMESTAMP
);

-- Ontem
INSERT INTO reservas (
  farmacia_id,
  codigo,
  cliente_nome,
  cliente_tel,
  status,
  total_mt,
  itens,
  criada_em
)
VALUES
(
  '<FARMACIA_ID>',
  'RES-20260524-001',
  'Pedro Costa',
  '+258 84 555 1234',
  'pago',
  850.00,
  '[{"medicamento_id": "med-6", "nome": "Antibiótico 250mg", "qty": 3, "preco_unitario": 180}]',
  NOW() - INTERVAL '1 day'
);

-- Há 2 dias
INSERT INTO reservas (
  farmacia_id,
  codigo,
  cliente_nome,
  cliente_tel,
  status,
  total_mt,
  itens,
  criada_em
)
VALUES
(
  '<FARMACIA_ID>',
  'RES-20260523-001',
  'Ana Ferreira',
  '+258 82 111 2222',
  'pago',
  375.00,
  '[{"medicamento_id": "med-2", "nome": "Paracetamol 500mg", "qty": 2, "preco_unitario": 75}, {"medicamento_id": "med-3", "nome": "Ibuprofen 400mg", "qty": 2, "preco_unitario": 90}]',
  NOW() - INTERVAL '2 days'
);

-- Há 3 dias
INSERT INTO reservas (
  farmacia_id,
  codigo,
  cliente_nome,
  cliente_tel,
  status,
  total_mt,
  itens,
  criada_em
)
VALUES
(
  '<FARMACIA_ID>',
  'RES-20260522-001',
  'Carlos Matos',
  '+258 84 999 8888',
  'pago',
  520.00,
  '[{"medicamento_id": "med-1", "nome": "Amoxicilina 500mg", "qty": 2, "preco_unitario": 150}, {"medicamento_id": "med-4", "nome": "Cetirizina 10mg", "qty": 1, "preco_unitario": 120}]',
  NOW() - INTERVAL '3 days'
);

-- Há 5 dias
INSERT INTO reservas (
  farmacia_id,
  codigo,
  cliente_nome,
  cliente_tel,
  status,
  total_mt,
  itens,
  criada_em
)
VALUES
(
  '<FARMACIA_ID>',
  'RES-20260520-001',
  'Lucia Moura',
  '+258 82 333 4444',
  'pago',
  710.00,
  '[{"medicamento_id": "med-7", "nome": "Vitamina C", "qty": 5, "preco_unitario": 95}, {"medicamento_id": "med-8", "nome": "Dipirona 500mg", "qty": 2, "preco_unitario": 65}]',
  NOW() - INTERVAL '5 days'
);

-- ============================================================
-- CRIAR ÍNDICES PARA PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_medicamentos_farmacia ON medicamentos(farmacia_id);
CREATE INDEX IF NOT EXISTS idx_medicamentos_ativo ON medicamentos(ativo);
CREATE INDEX IF NOT EXISTS idx_medicamentos_stock_nivel ON medicamentos(stock_nivel);

CREATE INDEX IF NOT EXISTS idx_reservas_farmacia ON reservas(farmacia_id);
CREATE INDEX IF NOT EXISTS idx_reservas_status ON reservas(status);
CREATE INDEX IF NOT EXISTS idx_reservas_criada_em ON reservas(criada_em);

-- ============================================================
-- INSTRUÇÕES DE USO
-- ============================================================
/*
  1. Copie TODO o conteúdo deste arquivo
  2. Vá para: https://app.supabase.com → SQL Editor
  3. Cole o código
  4. Execute

  IMPORTANTE: 
  - Substitua todas as ocorrências de '<FARMACIA_ID>' pelo UUID real da sua farmácia
  - Para encontrar o ID, execute: SELECT id FROM farmacias WHERE email = 'admin@makinino.mz';
  - Copie o UUID retornado e substitua em todos os lugares

  APÓS EXECUTAR:
  - Refresque o navegador (F5)
  - Faça login no portal
  - O dashboard deve mostrar dados e gráficos
*/
