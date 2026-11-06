# Sincronização e Atualização das Manicures Ativas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Equalizar todas as 8 manicures ativas (`juliasoares-nails`, `lauani-souza`, `studio-vitoria`, `tais-ribeiro`, `studio-juliatomihama`, `emily-souza`, `micaella-beauty` e `jussara-esmalteria`) para ficarem 100% no mesmo nível tecnológico e funcional de `jerusa-beauty` (incluindo cobrança de sinal Pix opcional, contratos em PDF, notificações web push com `waitUntil`, auto-cura do WhatsApp com novo gateway, lembretes e mensagens de aniversário, correções na Bio), preservando estritamente a identidade visual de cada uma, dados existentes no banco e garantindo que apenas `jerusa-beauty` possua `.git`.

**Architecture:** Mapeamento de matriz de parâmetros por cliente (`app_id`, `nome_negocio`, `storage_key`, `conta_cloudflare`, `db_id`), sincronização controlada de módulos backend (`functions/`) e frontend (`public/`), preservação de ativos visuais (`public/img/`, manifestos e CSS personalizado), correção de bugs de marcação na Bio e validação de sintaxe e deploy.

**Tech Stack:** Cloudflare Pages, Cloudflare D1 (SQLite), JavaScript ES Modules, jsPDF, Web Push API, Baileys Zap Gateway via Render.

**Spec:** Pedido explícito do usuário: "O que eu quero é que TODAS as MANICURES ATIVAS fiquem IGUAIS a Jerusa... A UNICA DIFERENÇA deve ser o FATO que Jerusa TAMBÈM ESTÁ NO GIT (nesse caso permanece SÓ JERUSA NO GIT).. AS DEMAIS CONFIGURAÇÕES ALTERAÇÃO E MELHORIAS DEVEM SER PARA TODAS: juliasoares-nails, lauani-souza, studio-vitoria, tais-ribeiro, studio-juliatomihama, estetica-emilysouza, micaella-beauty e jussara-esmalteria (respeitando a individualidade de sem sem cobrança)".

## Global Constraints

- Apenas `jerusa-beauty` deve manter controle de versão Git (`.git`). Pastas `.git` existentes em outros projetos devem ser removidas.
- Não sobrescrever ou apagar dados dos bancos D1 das clientes.
- Preservar os arquivos de identidade visual (`public/img/*`, `manifest.webmanifest`, favicons e logotipos).
- Respeitar a configuração individual de cobrança de cada manicure: não forçar `sinal_ativo = 1` no banco de ninguém; a funcionalidade de sinal Pix fica disponível no painel Ajustes para ser ativada ou desativada quando a cliente desejar.
- O `DEFAULT_APP_ID` do WhatsApp deve apontar para o identificador individual de cada manicure.
- O roteador `functions/_lib/router.js` em todas as manicures deve repassar o `waitUntil` do Cloudflare Workers.
- O HTML da Bio (`public/bio/index.html`) em todas as manicures deve ter `id="bio-btn-whats"` e `id="bio-whats-sub"` devidamente associados ao botão de WhatsApp.

## Review Focus

1. **Parâmetro de Sessão do WhatsApp (`DEFAULT_APP_ID`):** Se esquecido como `jerusa-beauty`, uma manicure pode disparar mensagens usando a sessão da Jerusa. Deve ser estritamente o slug de cada uma.
2. **Identidade do D1 em `wrangler.toml`:** O binding do banco de dados e `database_id` não podem ser alterados durante a cópia de arquivos.
3. **Credencial de Deploy em `scripts/deploy.mjs`:** Manter o `accountId` e `project-name` específicos de cada conta da Cloudflare.
4. **Armazenamento Demo em `admin.js`:** A chave de `localStorage` (`*_demo_info`) deve ser única por projeto para evitar conflito de sessão se o usuário abrir dois painéis no mesmo navegador.
5. **IDs de elementos no DOM da Bio:** Garantir que o botão do WhatsApp oculte/exiba dinamicamente e carregue o número correto sem afetar o botão de agendamento online.

---

## Matriz de Clientes e Parâmetros

| Slug Projeto | Nome do Negócio | Conta Cloudflare | D1 Database ID |
|---|---|---|---|
| `juliasoares-nails` | Julia Soares Nails | `7fd07bf9fdec715ef4cb326c9094f2d1` | `d3799f5a-cdc5-450f-a147-84e661e377ba` |
| `lauani-souza` | Lauani Souza Nails Designer | `7fd07bf9fdec715ef4cb326c9094f2d1` | `7f0b2f2c-c028-4583-a7da-ce28b738bc32` |
| `studio-vitoria` | Studio Vitória | `7fd07bf9fdec715ef4cb326c9094f2d1` | `4f548467-1acf-41b1-b339-67ec6d998fd4` |
| `tais-ribeiro` | Taís Ribeiro Nails Designer | `ea579e15a601cd559cc18696e0c88b2d` | `1aba51d4-efa5-472c-acae-08ffda9aa273` |
| `studio-juliatomihama` | Studio Julia Tomihama | `7fd07bf9fdec715ef4cb326c9094f2d1` | `3c8ae31f-bbf5-4e76-8237-1cbbc3864cd4` |
| `emily-souza` | Estética Emily de Souza | `7fd07bf9fdec715ef4cb326c9094f2d1` | `3dcb13d4-ac4d-4e88-a3de-34897348e504` |
| `micaella-beauty` | Micaella Beauty | `7fd07bf9fdec715ef4cb326c9094f2d1` | `444d455c-f938-422d-bc76-8770235b1d97` |
| `jussara-esmalteria` | Jussara Esmalteria | `ea579e15a601cd559cc18696e0c88b2d` | `a5321603-7fbb-41c9-98c1-0241527e4516` |

---

## Tasks

### Task 1: Limpeza de Git nas outras pastas
Remover qualquer pasta `.git` fora de `jeursa-beauty` para cumprir a regra de que somente Jerusa permanece sob controle de versão Git.

- [x] Verificar existência de `.git` em `juliasoares-nails` e `emily-souza`
- [x] Excluir `.git` desses projetos
- [x] Confirmar que apenas `jeursa-beauty` possui `.git`

### Task 2: Script de sincronização parametrizado
Criar script em `scratch/sincronizar_manicures.js` que replica toda a base tecnológica de `jeursa-beauty` para os 8 projetos, aplicando as substituições necessárias.

- [x] Copiar backend:
  - `functions/_lib/auth.js`
  - `functions/_lib/demo-auth.js`
  - `functions/_lib/dominio.js`
  - `functions/_lib/licenca.js`
  - `functions/_lib/push.js`
  - `functions/_lib/rotas-admin.js` (com link de origem para `${slug}.pages.dev`)
  - `functions/_lib/rotas-publicas.js` (com link de origem para `${slug}.pages.dev`)
  - `functions/_lib/router.js` (com repasse de `waitUntil`)
  - `functions/_lib/slots.js`
  - `functions/_lib/time.js`
  - `functions/_lib/util.js` (com `PADRAO.nome_negocio` individual)
  - `functions/_lib/whatsapp.js` (com `DEFAULT_APP_ID = '${appId}'`)
  - `functions/api/[[route]].js`
- [x] Copiar assets e bibliotecas frontend:
  - `public/_headers`
  - `public/_routes.json`
  - `public/sw.js`
  - `public/links/index.html`
  - `public/admin/js/contrato-pdf.js`
  - `public/admin/js/jspdf.umd.min.js`
  - `public/js/pix.js`
  - `public/js/vendor/qrcode.js`
  - `public/js/comum.js`
- [x] Sincronizar e parametrizar `public/admin/admin.js`:
  - Atualizar lógica completa (sinal Pix, PDF, bloqueios, lembretes, aniversários, bio)
  - Parametrizar a chave de storage demo `${slug}_demo_info`
  - Parametrizar nome do negócio padrão
- [x] Sincronizar `public/admin/index.html`:
  - Incluir tags de script para `jspdf` e `contrato-pdf.js`
  - Preservar título individual
- [x] Sincronizar e parametrizar `public/js/cliente.js`:
  - Incluir fluxo de sinal Pix, QR code, cópia e cola
  - Atualizar mensagens de confirmação respeitando o nome da profissional
- [x] Sincronizar e corrigir `public/bio/bio.js` e `public/bio/index.html`:
  - Atualizar `bio.js`
  - Garantir que `index.html` em todos os projetos tenha `id="bio-btn-whats"` no botão de WhatsApp e `id="bio-whats-sub"` no texto auxiliar do WhatsApp (sem conflito com o botão de agendamento online)
- [x] Sincronizar `schema.sql` em todos os projetos com a versão mais recente.

### Task 3: Validação de sintaxe e integridade
Executar validação automatizada em todos os 8 projetos para verificar integridade de código e arquivos.

- [x] Executar `node --check` em todos os arquivos `.js` sincronizados
- [x] Verificar que nenhum projeto perdeu seu `wrangler.toml` original
- [x] Verificar que nenhum projeto perdeu suas imagens (`public/img/`)

### Task 4: Executar Deploy e Verificação Live
Executar o deploy de cada uma das manicures e validar que os endpoints retornam `200 OK` com a nova estrutura.

- [x] Rodar deploy de `tais-ribeiro` e verificar retorno live
- [x] Rodar deploy dos projetos na conta principal `7fd07bf9fdec715ef4cb326c9094f2d1`
- [x] Rodar deploy de `jussara-esmalteria` na conta `ea579e15a601cd559cc18696e0c88b2d`
- [x] Testar status da API `/api/publico/config` e página `/bio`
