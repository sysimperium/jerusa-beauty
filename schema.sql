-- Jussara Esmalteria — esquema do banco (Cloudflare D1 / SQLite)
-- Horários são guardados como data local (AAAA-MM-DD) + minutos desde 00:00.
-- Fuso fixo: America/Fortaleza (UTC-3, sem horário de verão).

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  expira_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tentativas_login (
  ip TEXT NOT NULL,
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tentativas ON tentativas_login (ip, criado_em);

CREATE TABLE IF NOT EXISTS expediente (
  dia INTEGER PRIMARY KEY CHECK (dia BETWEEN 0 AND 6), -- 0 = domingo
  ativo INTEGER NOT NULL DEFAULT 0,
  inicio_min INTEGER NOT NULL DEFAULT 480,
  fim_min INTEGER NOT NULL DEFAULT 1020,
  pausa_inicio_min INTEGER,
  pausa_fim_min INTEGER
);

CREATE TABLE IF NOT EXISTS bloqueios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  inicio_min INTEGER NOT NULL,
  fim_min INTEGER NOT NULL,
  motivo TEXT
);
CREATE INDEX IF NOT EXISTS idx_bloqueios_data ON bloqueios (data);

CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
  duracao_min INTEGER NOT NULL CHECK (duracao_min > 0),
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL UNIQUE,
  aniversario_dia INTEGER CHECK (aniversario_dia BETWEEN 1 AND 31),
  aniversario_mes INTEGER CHECK (aniversario_mes BETWEEN 1 AND 12),
  ultimo_aviso_aniversario_ano INTEGER,
  ultimo_endereco TEXT,
  observacoes TEXT,
  ultimo_aviso_fidelizacao TEXT,
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clientes_aniversario ON clientes (aniversario_mes, aniversario_dia);

CREATE TABLE IF NOT EXISTS cache_licenca (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL,
  dados_json TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes (id),
  data TEXT NOT NULL,
  inicio_min INTEGER NOT NULL,
  duracao_min INTEGER NOT NULL,
  local TEXT NOT NULL CHECK (local IN ('espaco', 'domicilio')),
  endereco TEXT,
  referencia TEXT,
  preco_tabela_centavos INTEGER NOT NULL,
  valor_cobrado_centavos INTEGER,
  status TEXT NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'concluido', 'cancelado', 'faltou')),
  pago INTEGER NOT NULL DEFAULT 0,
  forma_pagamento TEXT,
  token TEXT NOT NULL UNIQUE,
  origem TEXT NOT NULL DEFAULT 'cliente',
  observacoes TEXT,
  lembrete_24h_enviado INTEGER NOT NULL DEFAULT 0,
  lembrete_2h_enviado INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agend_data ON agendamentos (data, status);
CREATE INDEX IF NOT EXISTS idx_agend_cliente ON agendamentos (cliente_id);

CREATE TABLE IF NOT EXISTS agendamento_servicos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos (id) ON DELETE CASCADE,
  servico_id INTEGER,
  nome TEXT NOT NULL,
  preco_centavos INTEGER NOT NULL,
  duracao_min INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agsrv ON agendamento_servicos (agendamento_id);

CREATE TABLE IF NOT EXISTS despesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  data TEXT NOT NULL,
  categoria TEXT
);
CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas (data);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  ultimo_sucesso INTEGER,
  falhas_consecutivas INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions (endpoint);

