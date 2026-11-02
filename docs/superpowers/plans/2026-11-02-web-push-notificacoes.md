# Notificações Web Push no Celular da Manicure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a profissional receba alertas sonoros e push em tempo real no celular (iOS 16.4+ e Android) a cada novo agendamento ou cancelamento realizado no site, sem alterar nenhuma funcionalidade existente (WhatsApp permanece 100% ativo).

**Architecture:** Módulo Web Push em `functions/_lib/push.js` construído sobre a Web Crypto API (`crypto.subtle`) pura (RFC 8291 AES-128-GCM e RFC 8292 VAPID ES256). As assinaturas dos aparelhos são persistidas na tabela `push_subscriptions` no D1. Os disparos ocorrem assincronamente e protegidos por `try/catch` dentro dos handlers de `POST /publico/agendar` e cancelamento em `rotas-publicas.js`. O Service Worker (`sw.js`) exibe as notificações com som e vibração e foca a agenda ao clicar.

**Tech Stack:** JavaScript (ES Modules), Cloudflare Pages Functions / Workers, Node.js (`DatabaseSync`), SQLite/D1, Web Crypto API (`crypto.subtle`), Web Push API (Service Worker Push & Notification).

**Spec:** `docs/superpowers/specs/2026-11-02-web-push-notificacoes-design.md`

## Global Constraints

- Runtime sem dependências binárias adicionais: usar `crypto.subtle` nativo do Cloudflare Workers e Node 22+.
- Isolamento total de falhas: o disparo de Web Push nunca pode interromper, atrasar ou falhar o agendamento da cliente.
- O canal de WhatsApp (`meustudio-zap` / Baileys) deve ser preservado intacto, continuando a enviar confirmações e lembretes normalmente.
- Suporte a múltiplos aparelhos registrados para o mesmo estúdio (ex: celular e tablet).
- Auto-limpeza de inscrições inválidas (HTTP 410 / 404 retornado por Apple APNs ou Google FCM).

## Review Focus

1. **Assinatura VAPID em URLs APNs/FCM:** O cabeçalho `Authorization: vapid t=..., k=...` deve conter o claim `aud` correspondente exatamente à origem do endpoint (ex: `https://web.push.apple.com` ou `https://fcm.googleapis.com`).
2. **Padding e cabeçalho AES-128-GCM (RFC 8291):** A cifragem da carga útil deve respeitar a estrutura binária oficial com salt (16 bytes), record size (4096) e chave pública efêmera (65 bytes não comprimida).
3. **Agendamento sem nenhuma assinatura ativa cadastrada:** Se a tabela `push_subscriptions` estiver vazia, `POST /publico/agendar` deve retornar 201 imediatamente sem lançar erro nem lentidão.
4. **Tratamento de token revogado (410 Gone):** Inscrições expiradas devem ser removidas da tabela `push_subscriptions` para não degradar a performance de envios futuros.
5. **Recuperação de foco no Service Worker:** Ao clicar na notificação push no celular, se a tela de `/admin/` já estiver aberta, deve trazê-la para o primeiro plano em vez de abrir abas duplicadas.

---

### Task 1: Esquema de Banco de Dados & Gestão de Chaves VAPID

**Files:**
- Modify: `schema.sql:110-118`
- Create: `functions/_lib/push.js`
- Test: `test/push.test.js`

**Interfaces:**
- Produces:
  - `obterOuCriarChavesVapid(db: D1Database): Promise<{ publicKey: string, privateKeyJwk: object, subject: string }>`
  - `garantirTabelaPush(db: D1Database): Promise<void>`

- [ ] **Step 1: Escrever teste de persistência e geração de chaves VAPID**

Adicionar em `test/push.test.js`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { obterOuCriarChavesVapid, garantirTabelaPush } from '../functions/_lib/push.js';

test('push: cria tabela push_subscriptions e gera chaves VAPID automaticamente', async () => {
  const dbSync = new DatabaseSync(':memory:');
  dbSync.exec('CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);');
  const db = {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async (col) => {
          const row = dbSync.prepare(sql).get(...args);
          return col ? row?.[col] : row;
        },
        all: async () => ({ results: dbSync.prepare(sql).all(...args) }),
        run: async () => dbSync.prepare(sql).run(...args),
      }),
      first: async () => dbSync.prepare(sql).get(),
      run: async () => dbSync.prepare(sql).run(),
    }),
  };

  await garantirTabelaPush(db);
  const chaves = await obterOuCriarChavesVapid(db);
  assert.ok(chaves.publicKey, 'Deve retornar chave pública VAPID');
  assert.ok(chaves.privateKeyJwk, 'Deve retornar JWK da chave privada');
  assert.match(chaves.subject, /mailto:|https:/);

  // Segunda chamada deve retornar as mesmas chaves salvas
  const chavesRepetidas = await obterOuCriarChavesVapid(db);
  assert.equal(chavesRepetidas.publicKey, chaves.publicKey, 'Deve reutilizar a chave salva no banco');
});
```

- [ ] **Step 2: Executar teste para verificar falha inicial**

Run: `node --test test/push.test.js`  
Expected: FAIL (módulo `../functions/_lib/push.js` não encontrado)

- [ ] **Step 3: Implementar `garantirTabelaPush` e `obterOuCriarChavesVapid` em `functions/_lib/push.js` e atualizar `schema.sql`**

- Adicionar `CREATE TABLE IF NOT EXISTS push_subscriptions (...)` ao `schema.sql`.
- Em `functions/_lib/push.js`:
  - Usar `crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])`.
  - Exportar chave pública em formato SPKI/Raw convertido em Base64URL.
  - Exportar chave privada em formato JWK JSON string.
  - Salvar em `config` com `chave = 'vapid_public_key'`, `'vapid_private_key'`, `'vapid_subject'`.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `node --test test/push.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add schema.sql functions/_lib/push.js test/push.test.js
git commit -m "feat(push): adicionar tabela push_subscriptions e gerador de chaves VAPID"
```

---

### Task 2: Cifragem AES-128-GCM e Envio de Notificação Push (RFC 8291 / 8292)

**Files:**
- Modify: `functions/_lib/push.js`
- Test: `test/push.test.js`

**Interfaces:**
- Consumes: `obterOuCriarChavesVapid` da Task 1.
- Produces:
  - `cifrarPayloadPush(subscription: { p256dh: string, auth: string }, payloadJson: object): Promise<Uint8Array>`
  - `gerarHeaderVapid(endpoint: string, vapid: { publicKey: string, privateKeyJwk: object, subject: string }): Promise<string>`
  - `enviarPushParaAssinatura(db: D1Database, subscription: object, payload: object, options?: { fetchFn?: typeof fetch }): Promise<boolean>`
  - `dispararPushParaTodos(db: D1Database, payload: object, options?: { fetchFn?: typeof fetch }): Promise<{ total: number, enviados: number, falhas: number, removidos: number }>`

- [ ] **Step 1: Escrever teste de cifragem e geração de JWT VAPID**

Adicionar em `test/push.test.js`:
```javascript
import { cifrarPayloadPush, gerarHeaderVapid, enviarPushParaAssinatura } from '../functions/_lib/push.js';

test('push: gera assinatura VAPID com formato t=..., k=...', async () => {
  const dbSync = new DatabaseSync(':memory:');
  dbSync.exec('CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);');
  const db = {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async (col) => {
          const row = dbSync.prepare(sql).get(...args);
          return col ? row?.[col] : row;
        },
        all: async () => ({ results: dbSync.prepare(sql).all(...args) }),
        run: async () => dbSync.prepare(sql).run(...args),
      }),
      first: async () => dbSync.prepare(sql).get(),
      run: async () => dbSync.prepare(sql).run(),
    }),
  };
  const vapid = await obterOuCriarChavesVapid(db);
  const header = await gerarHeaderVapid('https://fcm.googleapis.com/fcm/send/fake-token', vapid);
  assert.match(header, /^vapid t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=[A-Za-z0-9_-]+$/);
});

test('push: remove assinatura quando servico push retorna 410 Gone', async () => {
  const dbSync = new DatabaseSync(':memory:');
  dbSync.exec(`
    CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE, p256dh TEXT, auth TEXT, criado_em INTEGER, ultimo_sucesso INTEGER, falhas_consecutivas INTEGER DEFAULT 0);
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, criado_em) VALUES ('https://push.apple.com/sub1', 'p256', 'auth', 123);
  `);
  const db = {
    prepare: (sql) => ({
      bind: (...args) => ({
        first: async (col) => {
          const row = dbSync.prepare(sql).get(...args);
          return col ? row?.[col] : row;
        },
        all: async () => ({ results: dbSync.prepare(sql).all(...args) }),
        run: async () => dbSync.prepare(sql).run(...args),
      }),
      first: async () => dbSync.prepare(sql).get(),
      run: async () => dbSync.prepare(sql).run(),
    }),
  };

  const mockFetch = async () => ({ status: 410, ok: false });
  const ok = await enviarPushParaAssinatura(db, { endpoint: 'https://push.apple.com/sub1', p256dh: 'p256', auth: 'auth' }, { title: 'Teste' }, { fetchFn: mockFetch });
  assert.equal(ok, false);
  const restante = dbSync.prepare('SELECT COUNT(*) AS c FROM push_subscriptions').get();
  assert.equal(restante.c, 0, 'Inscrição 410 deve ser removida');
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `node --test test/push.test.js`  
Expected: FAIL

- [ ] **Step 3: Implementar RFC 8291 e RFC 8292 em `functions/_lib/push.js`**

- Implementar derivação ECDH, HKDF e criptografia AES-GCM 128 com a Web Crypto API nativa.
- Implementar geração de VAPID Authorization JWT assinado via ES256.
- Implementar envio HTTP POST com headers `Urgency: high`, `TTL: 86400`, `Content-Encoding: aes128gcm`.
- Implementar remoção automática caso `status === 404 || status === 410`.

- [ ] **Step 4: Executar testes de push**

Run: `node --test test/push.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/push.js test/push.test.js
git commit -m "feat(push): implementar criptografia AES-128-GCM e envio VAPID puro"
```

---

### Task 3: Endpoints Administrativos de Web Push

**Files:**
- Modify: `functions/_lib/rotas-admin.js:630-653`
- Test: `test/push.test.js`

**Interfaces:**
- Consumes: `obterOuCriarChavesVapid`, `garantirTabelaPush`, `dispararPushParaTodos` de `push.js`.
- Produces:
  - `GET /admin/push/chave-publica`
  - `POST /admin/push/inscrever`
  - `DELETE /admin/push/desinscrever`
  - `POST /admin/push/teste`

- [ ] **Step 1: Escrever teste para as rotas administrativas de push**

Adicionar em `test/push.test.js`:
```javascript
import { rota, despachar } from '../functions/_lib/router.js';

test('rotas admin push: inscrição e desinscrição persistem corretamente', async () => {
  // Teste despachando para as rotas /admin/push/chave-publica, /admin/push/inscrever e /admin/push/desinscrever
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `node --test test/push.test.js`  
Expected: FAIL

- [ ] **Step 3: Adicionar as rotas em `functions/_lib/rotas-admin.js`**

Implementar:
- `rota('GET', '/admin/push/chave-publica', ...)`
- `rota('POST', '/admin/push/inscrever', ...)`
- `rota('DELETE', '/admin/push/desinscrever', ...)`
- `rota('POST', '/admin/push/teste', ...)`

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `node --test test/push.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/rotas-admin.js test/push.test.js
git commit -m "feat(push): adicionar rotas administrativas de gerenciamento e teste de push"
```

---

### Task 4: Disparo de Alertas nos Eventos de Agendamento e Cancelamento

**Files:**
- Modify: `functions/_lib/push.js` (helpers `notificarPushNovoAgendamento` e `notificarPushCancelamento`)
- Modify: `functions/_lib/rotas-publicas.js:100-127, 160-178`
- Test: `test/push.test.js`

**Interfaces:**
- Consumes: `dispararPushParaTodos` de `push.js`.
- Produces:
  - `notificarPushNovoAgendamento(db, env, agendamentoInfo, options)`
  - `notificarPushCancelamento(db, env, agendamentoInfo, options)`

- [ ] **Step 1: Escrever teste de disparo em novo agendamento e cancelamento**

Adicionar em `test/push.test.js`:
```javascript
test('push: notificarPushNovoAgendamento formata título e corpo corretamente com moeda e horário', async () => {
  // Valida geração do payload de notificação com emoji, nome, data e valor
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `node --test test/push.test.js`  
Expected: FAIL

- [ ] **Step 3: Implementar helpers e plugar em `functions/_lib/rotas-publicas.js`**

- Em `POST /publico/agendar`:
  ```javascript
  try {
    await notificarPushNovoAgendamento(db, env, {
      cliente_nome: nome,
      data: corpo.data,
      inicio_min: inicio,
      local,
      servicos,
      preco,
      token,
    });
  } catch (err) {
    console.error('Falha ao enviar notificação Web Push:', err);
  }
  ```
- Em `POST /publico/agendamento/:token/cancelar`:
  ```javascript
  try {
    await notificarPushCancelamento(db, env, {
      cliente_nome: a.cliente_nome,
      data: a.data,
      inicio_min: a.inicio_min,
      servicos: a.servicos,
    });
  } catch (err) {
    console.error('Falha ao enviar notificação Web Push de cancelamento:', err);
  }
  ```

- [ ] **Step 4: Executar suíte completa de testes para garantir zero regressão**

Run: `node --test test/aniversario.test.js test/config-ajustes.test.js test/financeiro.test.js test/pix.test.js test/slots.test.js test/whatsapp.test.js test/push.test.js`  
Expected: PASS (todos os 30 testes existentes + novos testes)

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/push.js functions/_lib/rotas-publicas.js test/push.test.js
git commit -m "feat(push): plugar disparo de notificações push em novos agendamentos e cancelamentos"
```

---

### Task 5: Service Worker & Interface Administrativa do Painel

**Files:**
- Modify: `public/sw.js`
- Modify: `public/admin/admin.js`
- Modify: `public/css/app.css` (se necessário para o card de push)

**Interfaces:**
- Consumes: Endpoints `/admin/push/*` da Task 3.
- Produces:
  - Service worker listener `'push'` e `'notificationclick'`.
  - Componente de ativação/desativação e botão de teste no painel de Ajustes da manicure.

- [ ] **Step 1: Implementar handlers de push no Service Worker (`public/sw.js`)**

- Adicionar listener para `push`:
  ```javascript
  self.addEventListener('push', (event) => {
    let dados = {};
    try { dados = event.data ? event.data.json() : {}; } catch { dados = { body: event.data ? event.data.text() : '' }; }
    const title = dados.title || 'Jerusa Beauty';
    const options = {
      body: dados.body || '',
      icon: dados.icon || '/img/icon-192.png',
      badge: dados.badge || '/img/favicon.png',
      vibrate: dados.vibrate || [200, 100, 200],
      tag: dados.tag || 'jerusa-push',
      renotify: true,
      data: dados.data || { url: '/admin/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  });
  ```
- Adicionar listener para `notificationclick`:
  - Focar aba existente de `/admin/` ou abrir nova.

- [ ] **Step 2: Implementar módulo de UI no painel administrativo (`public/admin/admin.js`)**

- Adicionar card de Notificações Web Push na tela de Ajustes do painel:
  - Detecção de permissão (`Notification.permission`).
  - Botão de ativação que solicita permissão, obtém chave pública, faz `pushManager.subscribe` e envia para a API.
  - Botão de desativação que faz `subscription.unsubscribe()` e chama `DELETE /admin/push/desinscrever`.
  - Botão de teste que chama `POST /admin/push/teste`.

- [ ] **Step 3: Testar localmente no navegador via `server.mjs`**

- Iniciar servidor local: `node server.mjs`
- Acessar `/admin/`, verificar renderização do card e ausência de erros no console.

- [ ] **Step 4: Commit**

```bash
git add public/sw.js public/admin/admin.js public/css/app.css
git commit -m "feat(push): adicionar suporte a push no Service Worker e card de gerenciamento no admin"
```

---

### Task 6: Verificação de Ponta a Ponta e Deploy Cloudflare

**Files:**
- N/A (Execução de comandos de infraestrutura e teste E2E)

- [ ] **Step 1: Rodar a suíte completa de testes unitários**

Run: `node --test test/*.test.js`  
Expected: PASS (todos os testes verdes)

- [ ] **Step 2: Executar migração no Cloudflare D1 em produção**

Run:
```bash
wrangler d1 execute jussara-esmalteria --remote --command="CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, criado_em INTEGER NOT NULL, ultimo_sucesso INTEGER, falhas_consecutivas INTEGER NOT NULL DEFAULT 0); CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions (endpoint);"
```

- [ ] **Step 3: Fazer deploy no Cloudflare Pages**

Run:
```bash
wrangler pages deploy public
```

- [ ] **Step 4: Commit final e verificação de saúde**

```bash
git push origin main
```
