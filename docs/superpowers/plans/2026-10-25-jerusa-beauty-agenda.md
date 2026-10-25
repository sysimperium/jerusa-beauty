# Jerusa Beauty Agenda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar, configurar, personalizar e publicar na Cloudflare Pages o aplicativo completo de agendamento PWA da Jerusa Beauty (`jerusa-beauty.pages.dev`), com integração ao WhatsApp (`meustudio-zap`), novo recurso automático de aniversário (Opção A), cadastro como mensalidade na Central Root (`root-sysimperium`) e deploy em produção.

**Architecture:** Frontend estático servido via Cloudflare Pages com backend serverless em Pages Functions (`functions/api/[[route]].js`), banco de dados relacional Cloudflare D1 (SQLite), gateway de WhatsApp desacoplado via Baileys API (`meustudio-zap`) e middleware de verificação de licença com cache D1 local.

**Tech Stack:** JavaScript (ES Modules), Cloudflare Pages & Functions, Cloudflare D1 (SQLite), Node.js test runner (`node --test`), Python (Pillow) para geração de assets, REST APIs Cloudflare v4.

**Spec:** [`docs/superpowers/specs/2026-10-25-jerusa-beauty-agenda-design.md`](file:///C:/Users/Ian%20&%20Jerusa/Documents/AppsCriacao/jeursa-beauty/docs/superpowers/specs/2026-10-25-jerusa-beauty-agenda-design.md)

## Global Constraints

- **App ID:** `jerusa-beauty`
- **Nome do Negócio:** Jerusa Beauty
- **URL do App:** `https://jerusa-beauty.pages.dev`
- **WhatsApp Oficial:** `5583996677643`
- **Conta Cloudflare do App (Jerusa):** `7fd07bf9fdec715ef4cb326c9094f2d1`
- **Conta Cloudflare Central Root (Ian):** `ea579e15a601cd559cc18696e0c88b2d`
- **Banco Central Root:** `root-sysimperium` (`a99f1bbf-de62-484d-b345-27a515d3ce45`)
- **Plano na Central Root:** `mensalidade` (R$ 39,90 = 3990 centavos, dia 10)
- **Fuso Horário:** Fixo em `America/Fortaleza` (UTC-3)
- **Sem builds pesados:** O conteúdo da pasta `public/` é servido nativamente.

## Review Focus

1. **Campos vazios de aniversário no agendamento:** O cliente não deve ser obrigado a preencher dia e mês de aniversário; se omitido, o agendamento conclui normalmente sem gravar aniversário.
2. **Duplicidade de envio de parabéns:** Clientes que façam aniversário no mesmo dia não podem receber mais de uma mensagem no mesmo ano (`ultimo_aviso_aniversario_ano`).
3. **Isolamento de sessão WhatsApp:** O `app_id` `jerusa-beauty` deve ser passado em todas as chamadas para `meustudio-zap`, garantindo que a sessão da Jussara e de outros clientes não seja afetada.
4. **Resiliência do middleware de licença:** Caso a Central Root esteja momentaneamente indisponível, o app deve consultar o cache local D1 (`cache_licenca`) e manter a agenda ativa sem interrupções.
5. **Formato das imagens PWA:** Favicon, apple-touch-icon e ícones 192/512 devem ter formatos PNG válidos e dimensões exatas para validação correta do PWA.

---

### Task 1: Scaffolding do Projeto e Configurações Base

**Files:**
- Create: `wrangler.toml`
- Create: `package.json`
- Create: `public/index.html`
- Create: `public/manifest.webmanifest`
- Create: `public/admin/index.html`
- Create: `public/bio/index.html`
- Modify: `public/manifest.webmanifest`

**Interfaces:**
- Produces: Estrutura completa de arquivos base em `C:\Users\Ian & Jerusa\Documents\AppsCriacao\jeursa-beauty`, herdando o template de `jussara-esmalteria`.

- [ ] **Step 1: Copiar arquivos base do modelo `jussara-esmalteria` para o diretório atual**
  Copiar `public/`, `functions/`, `scripts/`, `test/`, `schema.sql`, `seed.sql`, `package.json` e `.gitignore`, excluindo `node_modules`, `.wrangler` e `.git`.
- [ ] **Step 2: Criar junção de `node_modules` com o modelo para economizar espaço e evitar reinstalações**
  Executar: `cmd /c mklink /J "node_modules" "..\jussara-esmalteria\node_modules"`
- [ ] **Step 3: Ajustar `package.json` e `wrangler.toml` para Jerusa Beauty**
  Definir `name = "jerusa-beauty"` no `package.json` e no `wrangler.toml`.
- [ ] **Step 4: Personalizar metadados, títulos e nomes em `public/index.html`, `public/manifest.webmanifest`, `public/admin/index.html` e `public/bio/index.html`**
  Substituir "Jussara Soares Esmalteria" por "Jerusa Beauty" e atualizar o número de WhatsApp `5583996677643` na bio.

---

### Task 2: Processamento dos Assets Visuais a partir de `logomarca.png`

**Files:**
- Create: `scripts/gerar-icones.py`
- Produces:
  - `public/img/logo.png`
  - `public/img/logo-retrato.png`
  - `public/img/logo-preview.png`
  - `public/img/favicon.png`
  - `public/img/apple-touch-icon.png`
  - `public/img/icon-192.png`
  - `public/img/icon-512.png`

**Interfaces:**
- Consumes: `logomarca.png` (1254x1254) na raiz do projeto.
- Produces: Conjunto de imagens otimizadas para PWA, favicon e redes sociais.

- [ ] **Step 1: Criar script Python para redimensionamento e exportação dos assets**
  Escrever `scripts/gerar-icones.py` utilizando PIL/Pillow para gerar cada ícone mantendo proporção e nitidez.
- [ ] **Step 2: Executar a geração dos ícones**
  Rodar: `python scripts/gerar-icones.py`
- [ ] **Step 3: Verificar a existência e dimensões dos arquivos gerados em `public/img/`**
  Garantir que todos os 7 arquivos foram criados com tamanhos válidos.

---

### Task 3: Feature de Aniversário (TDD), Schema e Automação WhatsApp

**Files:**
- Create: `test/aniversario.test.js`
- Modify: `schema.sql`
- Modify: `seed.sql`
- Modify: `functions/_lib/whatsapp.js`
- Modify: `functions/_lib/rotas-admin.js`
- Modify: `functions/_lib/rotas-publicas.js`
- Modify: `functions/_lib/dominio.js`
- Modify: `public/index.html`
- Modify: `public/js/cliente.js`
- Modify: `public/admin/admin.js`

**Interfaces:**
- Consumes: Data atual em `functions/_lib/time.js`, `enviarMensagemZap` em `functions/_lib/whatsapp.js`.
- Produces:
  - Colunas `aniversario_dia`, `aniversario_mes`, `ultimo_aviso_aniversario_ano` na tabela `clientes`.
  - Função `processarAniversarios(db, env) -> { enviados: number, total_aniversariantes: number }`.
  - Endpoint `/admin/whatsapp/lembretes/processar` disparando lembretes + aniversários.
  - Card de aniversariantes do dia em `/admin/`.

- [ ] **Step 1: Escrever teste unitário para lógica de aniversário em `test/aniversario.test.js`**
  Testar:
  1. Formatação da mensagem discreta de aniversário com link.
  2. Validação e extração de dia e mês (`"15/08"` -> `{ dia: 15, mes: 8 }`).
  3. Ignorar datas inválidas sem lançar erro (mantendo opcional).
- [ ] **Step 2: Executar o teste para verificar falha inicial**
  Rodar: `node --test test/aniversario.test.js`
  Esperado: FAIL (funções ainda não implementadas).
- [ ] **Step 3: Atualizar `schema.sql` e `seed.sql`**
  Adicionar colunas `aniversario_dia`, `aniversario_mes`, `ultimo_aviso_aniversario_ano` e tabela `cache_licenca`. Configurar sementes para `nome_negocio = 'Jerusa Beauty'` e `whatsapp = '5583996677643'`.
- [ ] **Step 4: Implementar formatação e lógica de aniversário em `functions/_lib/whatsapp.js`**
  Implementar `formatarMensagemAniversario(cfg, cliente, linkAgendamento)` e `processarAniversarios(db, env)`.
- [ ] **Step 5: Integrar captura de aniversário em `dominio.js` e `rotas-publicas.js`**
  Permitir salvar `aniversario_dia` e `aniversario_mes` no `upsertCliente` ao agendar.
- [ ] **Step 6: Executar os testes unitários de aniversário para verificar aprovação**
  Rodar: `node --test test/aniversario.test.js`
  Esperado: PASS.
- [ ] **Step 7: Atualizar frontend do cliente (`public/js/cliente.js`) e painel admin (`public/admin/admin.js`)**
  Adicionar campo opcional no formulário do cliente e card de aniversariantes de hoje no início do admin.

---

### Task 4: Middleware de Licença e Cadastro na Central Root

**Files:**
- Create: `functions/_lib/licenca.js`
- Modify: `functions/api/[[route]].js`
- Modify: `painel-root-manicures` (execução D1 remoto)

**Interfaces:**
- Consumes: Central Root `https://root-sysimperium.pages.dev/api/licenca/verificar`.
- Produces:
  - Middleware ativo no app Jerusa Beauty protegendo rotas administrativas.
  - Registro da Jerusa Beauty na tabela `clientes_manicures` do banco central da conta do Ian com `tipo_plano: 'mensalidade'`.

- [ ] **Step 1: Criar `functions/_lib/licenca.js` com constantes da Jerusa**
  Configurar `APP_ID_PADRAO = 'jerusa-beauty'`, `CHAVE_LICENCA_PADRAO = 'chave-jerusabeauty-imperium-2026'`, `URL_ROOT_PADRAO = 'https://root-sysimperium.pages.dev'`.
- [ ] **Step 2: Importar `licenca.js` em `functions/api/[[route]].js`**
  Garantir que as rotas `/api/licenca/status` e o middleware de verificação sejam registrados.
- [ ] **Step 3: Cadastrar Jerusa Beauty no banco remoto `root-sysimperium` da Central Root**
  Executar comando D1 no banco central via Wrangler (usando conta do Ian `ea579e15a601cd559cc18696e0c88b2d`):
  Inserir cliente `jerusa-beauty`, plano `mensalidade`, valor `3990`, dia `10`, status `automatico`.
- [ ] **Step 4: Validar endpoint público de verificação de licença na Central Root**
  Rodar: `curl.exe -s "https://root-sysimperium.pages.dev/api/licenca/verificar?app_id=jerusa-beauty&chave=chave-jerusabeauty-imperium-2026"`
  Esperado: JSON com `status: "ativo"`, `tipo_plano: "mensalidade"`.

---

### Task 5: Execução Completa da Suíte de Testes

**Files:**
- Test: `test/*.test.js`

**Interfaces:**
- Consumes: Todos os módulos de slots, tempo, regras de horário, Pix e aniversário.

- [ ] **Step 1: Executar todos os testes do projeto**
  Rodar: `npm test`
  Esperado: Todos os testes passando sem erros.

---

### Task 6: Criação do Banco D1 e Migração na Conta da Jerusa

**Files:**
- Modify: `wrangler.toml`

**Interfaces:**
- Consumes: Credenciais Cloudflare Jerusa (`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`).
- Produces: Novo banco D1 `jerusa-beauty` com UUID populado no `wrangler.toml` e tabelas criadas.

- [ ] **Step 1: Criar o banco D1 `jerusa-beauty` na API Cloudflare da conta Jerusa**
  Executar chamada REST POST para `/accounts/7fd07bf9fdec715ef4cb326c9094f2d1/d1/database`.
- [ ] **Step 2: Atualizar `database_id` no `wrangler.toml`**
  Inserir o UUID retornado na seção `[[d1_databases]]`.
- [ ] **Step 3: Aplicar `schema.sql` e `seed.sql` no banco D1 remoto da Jerusa**
  Executar queries remotas via API Cloudflare.

---

### Task 7: Deploy na Cloudflare Pages e Validação ao Vivo

**Files:**
- Deployment de: `public/` e `functions/`

**Interfaces:**
- Produces: URL funcional `https://jerusa-beauty.pages.dev`.

- [ ] **Step 1: Criar o projeto Cloudflare Pages `jerusa-beauty`**
  Criar projeto via Wrangler com branch de produção `main`.
- [ ] **Step 2: Vincular o banco D1 `jerusa-beauty` à variável `DB` no Pages**
  Fazer chamada PATCH em `/pages/projects/jerusa-beauty` configurando `deployment_configs` para Production e Preview.
- [ ] **Step 3: Publicar os arquivos na Cloudflare Pages**
  Executar: `node node_modules/wrangler/wrangler-dist/cli.js pages deploy public --project-name jerusa-beauty --branch main`
- [ ] **Step 4: Executar Healthcheck ao vivo dos endpoints**
  - Testar `https://jerusa-beauty.pages.dev/api/publico/config` (status 200 e serviços retornados).
  - Testar `https://jerusa-beauty.pages.dev/api/licenca/status` (status 200, licença ativa, plano mensalidade).
  - Testar `https://jerusa-beauty.pages.dev/` (carregamento HTML).
