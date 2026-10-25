# Design Spec: Agenda Jerusa Beauty

**Data:** 2026-10-25  
**Identificador do App (Slug):** `jerusa-beauty`  
**Nome Oficial:** Jerusa Beauty  
**URL de Produção:** `https://jerusa-beauty.pages.dev`  
**Nicho:** Manicure & Nail Designer  
**WhatsApp Oficial da Profissional:** `5583996677643`  
**Conta Cloudflare de Hospedagem:** Jerusa (`7fd07bf9fdec715ef4cb326c9094f2d1`)  
**Conta Cloudflare da Central Root:** Ian (`ea579e15a601cd559cc18696e0c88b2d`)  

---

## 1. Visão Geral e Objetivos

Criar uma aplicação web progressiva (PWA) completa de agendamento e gestão financeira para a profissional **Jerusa Beauty**, baseada na arquitetura e estilo visual do modelo de referência `jussara-esmalteria`.

### Objetivos Principais:
1. **Experiência do Cliente (`/` e `/bio/`):**
   - Agendamento ágil de serviços (cálculo em tempo real de duração e valor total).
   - Escolha entre atendimento no espaço ou a domicílio.
   - Seleção de dia e horários disponíveis com algoritmo inteligente de respiro/deslocamento.
   - Captura opcional do **Dia e Mês de Aniversário** da cliente.
   - Link de confirmação (`/?a=<token>`) com cancelamento permitido até 12h antes.
   - Disparo imediato de confirmação via WhatsApp.

2. **Automação de WhatsApp Multitenant (`meustudio-zap`):**
   - Sessão isolada sob `app_id: "jerusa-beauty"` conectada ao WhatsApp oficial da Jerusa.
   - Lembretes automáticos 24h e 2h antes de cada agendamento.
   - Disparo automático de felicitações de aniversário (Opção A: 100% automático pela manhã com convite comercial discreto).
   - Mensagens de fidelização para clientes sumidas há mais de 15 dias (com delay humanizado e proteção anti-spam).

3. **Painel Administrativo da Manicure (`/admin/`):**
   - Autenticação PBKDF2 com cookies HttpOnly seguros.
   - Agenda do dia, histórico, remarcação, cancelamento e bloqueio de horários.
   - Conclusão de atendimento com ajuste de valor cobrado e geração dinâmica de QR Code Pix estático (BR Code) e Copia e Cola.
   - Controle financeiro detalhado (recebido, a receber, descontos, despesas, faturamento).
   - Gerenciamento de serviços, expediente e conexão da sessão WhatsApp com QR Code.
   - Exibição das aniversariantes do dia na tela inicial.

4. **Integração com a Central Root (`root-sysimperium`):**
   - Cadastro formal no banco D1 da Central Root com `tipo_plano: 'mensalidade'` (R$ 39,90/mês).
   - Middleware no app cliente para verificação periódica de licença com fallback em cache local D1 (`cache_licenca`).

5. **Deploy Cloudflare:**
   - Criação do banco D1 `jerusa-beauty` e aplicação de tabelas e sementes iniciais.
   - Criação do projeto Pages `jerusa-beauty` com vínculo do banco D1 `DB`.
   - Publicação na nuvem Cloudflare com validação ao vivo.

---

## 2. Arquitetura de Dados e Esquema D1

O banco de dados SQLite/D1 terá as tabelas base do modelo, acrescidas do controle de licença e aniversários:

### 2.1 Tabela `clientes` (Atualizada com Aniversário)
```sql
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
```

### 2.2 Tabela `cache_licenca`
```sql
CREATE TABLE IF NOT EXISTS cache_licenca (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL,
  dados_json TEXT NOT NULL,
  atualizado_em INTEGER NOT NULL
);
```

### 2.3 Demais Tabelas (Estrutura Jussara)
- `config`: Parâmetros de funcionamento (nome_negocio, whatsapp, expediente, respiro, etc.).
- `admin`: Credenciais criptografadas de acesso.
- `sessoes` e `tentativas_login`: Controle de sessão e segurança contra força bruta.
- `expediente` e `bloqueios`: Horários de atendimento e pausas.
- `servicos`: Catálogo de procedimentos, preços e tempos.
- `agendamentos` e `agendamento_servicos`: Histórico e reservas atômicas.
- `despesas`: Livro caixa de saídas financeiras.

---

## 3. Motor de Aniversário (Opção A — 100% Automático)

### 3.1 Captura
No fluxo de agendamento (`public/js/cliente.js`), o formulário conterá:
- Campo opcional: `aniversario` (máscara `DD/MM`).
- Validação no backend (`functions/_lib/dominio.js` e `rotas-publicas.js`): extrai dia e mês numéricos.

### 3.2 Rotina de Disparo
Em `functions/_lib/whatsapp.js`:
- Função `processarAniversarios(db, env)`:
  1. Identifica data atual (dia, mês e ano no fuso `America/Fortaleza`).
  2. Executa apenas em horário comercial adequado (a partir das 10h00 da manhã).
  3. Consulta clientes onde `aniversario_dia = dia_atual AND aniversario_mes = mes_atual AND (ultimo_aviso_aniversario_ano IS NULL OR ultimo_aviso_aniversario_ano < ano_atual)`.
  4. Formata a mensagem acolhedora com convite discreto e link de agendamento.
  5. Envia via `enviarMensagemZap` com espaçamento de segurança entre disparos.
  6. Atualiza `ultimo_aviso_aniversario_ano = ano_atual`.
- Integrada ao processamento diário de lembretes (`/admin/whatsapp/lembretes/processar`).

### 3.3 Interface Administrativa
- Na aba "Início", card dedicado informando as clientes aniversariantes do dia e a confirmação do envio automático realizado.

---

## 4. Integração Multi-tenant WhatsApp (`meustudio-zap`)

- **Host da API:** `https://meustudio-zap.onrender.com`
- **Cabeçalho:** `x-api-key: meustudio_zap_secret_2026`
- **Isolamento:** Parâmetro `app_id: "jerusa-beauty"`.
- As chaves de sessão e pareamento do Baileys ficam gravadas no D1 sob essa chave, sem conflito com `jussara-esmalteria`.

---

## 5. Cadastro na Central Root (`root-sysimperium`)

Query a ser executada no banco central `root-sysimperium` (D1 `a99f1bbf-de62-484d-b345-27a515d3ce45` na conta Ian `ea579e15a601cd559cc18696e0c88b2d`):

```sql
INSERT INTO clientes_manicures (
  app_id,
  nome_cliente,
  whatsapp,
  url_app,
  chave_licenca,
  tipo_plano,
  valor_mensalidade_centavos,
  dia_vencimento,
  status_manual,
  isento_mensalidade,
  observacoes,
  criado_em
) VALUES (
  'jerusa-beauty',
  'Jerusa Beauty',
  '5583996677643',
  'https://jerusa-beauty.pages.dev',
  'chave-jerusabeauty-imperium-2026',
  'mensalidade',
  3990,
  10,
  'automatico',
  0,
  'Instância Jerusa Beauty para testes/mensalidade recorrente R$ 39,90',
  strftime('%s', 'now') * 1000
);
```

---

## 6. Processamento de Imagens e Identidade Visual

A partir de `logomarca.png` (1254x1254) localizado na raiz de `jeursa-beauty`, serão gerados os seguintes arquivos com redimensionamento nítido e compressão adequada:
- `public/img/logo.png`
- `public/img/logo-retrato.png`
- `public/img/logo-preview.png`
- `public/img/favicon.png`
- `public/img/apple-touch-icon.png`
- `public/img/icon-192.png`
- `public/img/icon-512.png`

---

## 7. Passos de Deploy e Verificação

1. **Testes Locais:** Executar suíte de testes com `node --test` para garantir integridade matemática de horários e regras.
2. **Criação de D1 e Tabelas:** Via API REST Cloudflare na conta Jerusa.
3. **Criação do Projeto Pages e Deploy:** Via API REST Cloudflare e Wrangler CLI.
4. **Verificação de Healthcheck:**
   - `GET /api/publico/config` -> 200 OK
   - `GET /api/licenca/status` -> 200 OK (status ativo, plano mensalidade)
   - Carregamento de `/` e `/admin/`
