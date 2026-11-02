# Design Spec: Notificações Web Push no Celular da Manicure (Jerusa Beauty)

**Data:** 2026-11-02  
**Identificador do App:** `jerusa-beauty`  
**Autor:** Antigravity & Ian  
**Status:** Aprovado para Planejamento  

---

## 1. Visão Geral e Objetivos

Permitir que a profissional (manicure) receba **alertas sonoros e visuais em tempo real no celular** (Android e iOS 16.4+) no momento exato em que uma cliente realizar um novo agendamento ou cancelar um horário existente pelo site.

### Requisitos Fundamentais & Invariantes:
1. **Zero Impacto em Funcionalidades Existentes:** As mensagens automáticas de confirmação e lembretes para clientes via WhatsApp (`meustudio-zap` / Baileys) permanecem **100% inalteradas e ativas**. O Web Push é uma camada adicional de notificação voltada exclusivamente ao aparelho da profissional.
2. **Isolamento de Falhas:** O envio de notificações push é executado de forma não-bloqueante (assíncrona, via `try/catch` e `waitUntil`). Qualquer indisponibilidade temporária de rede ou falha no serviço de push **nunca** causará erro ou atraso na criação ou cancelamento de agendamentos para as clientes.
3. **Compatibilidade Total de Runtimes:** O motor de envio Web Push utilizará a Web Crypto API nativa (`crypto.subtle`), garantindo funcionamento idêntico e sem dependências binárias tanto em produção no **Cloudflare Pages / Workers** quanto no ambiente local / Docker ([server.mjs](file:///C:/Users/Ian%20&%20Jerusa/Documents/AppsCriacao/jeursa-beauty/server.mjs)).
4. **Auto-manutenção:** Chaves VAPID são geradas e salvas automaticamente no primeiro uso caso não existam. Assinaturas expiradas ou canceladas pelo sistema operacional (HTTP 410 Gone / 404 Not Found retornado por Apple APNs ou Google FCM) são removidas automaticamente do banco D1.

---

## 2. Arquitetura de Dados

### 2.1 Tabela `push_subscriptions` (Cloudflare D1 / SQLite)
Armazena os pontos de entrega (endpoints) e segredos criptográficos dos navegadores/celulares inscritos:

```sql
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
```

### 2.2 Chaves VAPID na Tabela `config`
As chaves VAPID necessárias para assinar as notificações (padrão RFC 8292) ficam armazenadas na tabela `config` já existente:
- `chave = 'vapid_public_key'`: Chave pública P-256 codificada em Base64URL (compartilhada com o navegador para `applicationServerKey`).
- `chave = 'vapid_private_key'`: Chave privada P-256 codificada em JWK ou Base64URL (mantida em segredo no backend).
- `chave = 'vapid_subject'`: Identificação do remetente (ex: `mailto:contato@jerusa-beauty.pages.dev`).

Se as chaves ainda não estiverem cadastradas ao iniciar o envio ou ao solicitar a chave pública, o módulo de push gera um par criptográfico P-256 via `crypto.subtle.generateKey` e persiste no banco automaticamente.

---

## 3. Motor Web Push Criptográfico ([functions/_lib/push.js](file:///C:/Users/Ian%20&%20Jerusa/Documents/AppsCriacao/jeursa-beauty/functions/_lib/push.js))

Módulo puro e autocontido responsável por:
1. **Gerenciamento de Chaves VAPID:**
   - `obterChavesVapid(db)`: Recupera as chaves da tabela `config` ou gera um novo par P-256 na inicialização.
2. **Criptografia de Carga Útil (RFC 8291 / AES-128-GCM):**
   - Gera par de chaves ECDH efêmeras locais.
   - Deriva o segredo compartilhado (ECDH) com a chave `p256dh` do cliente.
   - Aplica HKDF com o segredo de autenticação (`auth`) e um salt aleatório de 16 bytes para gerar a chave de cifragem AES-GCM e o nonce.
   - Monta o cabeçalho binário `aes128gcm` e cifra o JSON da notificação.
3. **Assinatura VAPID JWT (RFC 8292):**
   - Cria o JWT com `aud` (origem da URL do endpoint), `exp` (12 horas) e `sub` (vapid_subject).
   - Assina com algoritmo ES256 (ECDSA P-256 SHA-256) usando a chave privada VAPID.
4. **Despacho HTTP:**
   - Envia requisição `POST` com headers:
     - `Content-Encoding: aes128gcm`
     - `Content-Type: application/octet-stream`
     - `TTL: 86400`
     - `Urgency: high`
     - `Authorization: vapid t=<jwt>, k=<vapid_public_key>`
5. **Tratamento de Resposta & Limpeza:**
   - Status 200/201/202: Sucesso. Atualiza `ultimo_sucesso = Date.now()` e reseta `falhas_consecutivas = 0`.
   - Status 404 ou 410: O aparelho desinstalou ou revogou a permissão. Executa `DELETE FROM push_subscriptions WHERE endpoint = ?`.
   - Outros erros (ex: 5xx ou falha de rede temporária): Incrementa `falhas_consecutivas`. Se atingir 5 falhas consecutivas, remove do banco.

---

## 4. Endpoints da WebAPI

### 4.1 Endpoints Administrativos ([functions/_lib/rotas-admin.js](file:///C:/Users/Ian%20&%20Jerusa/Documents/AppsCriacao/jeursa-beauty/functions/_lib/rotas-admin.js))
Todas protegidas por autenticação de administrador (`{ admin: true }`):

- **`GET /admin/push/chave-publica`**
  - Retorna `{ public_key: string }` para ser utilizada pelo navegador no método `registration.pushManager.subscribe`.
- **`POST /admin/push/inscrever`**
  - Payload: `{ endpoint: string, p256dh: string, auth: string }`
  - Valida parâmetros e insere/atualiza em `push_subscriptions`.
  - Retorna `{ ok: true }`.
- **`DELETE /admin/push/desinscrever`**
  - Payload: `{ endpoint: string }`
  - Remove a inscrição correspondente da tabela `push_subscriptions`.
  - Retorna `{ ok: true }`.
- **`POST /admin/push/teste`**
  - Dispara uma notificação de teste imediata para todos os aparelhos cadastrados (ou para o endpoint fornecido).
  - Conteúdo:
    - Título: `🔔 Teste de Notificação Push`
    - Mensagem: `Notificações ativas com sucesso! Seu celular vai tocar sempre que entrar um novo agendamento. ✨`
    - Tag: `push-teste`
    - URL destino: `/admin/`
  - Retorna `{ ok: true, enviados: number, falhas: number }`.

### 4.2 Disparos nos Eventos Públicos ([functions/_lib/rotas-publicas.js](file:///C:/Users/Ian%20&%20Jerusa/Documents/AppsCriacao/jeursa-beauty/functions/_lib/rotas-publicas.js))

#### A. Ao Realizar Novo Agendamento (`POST /publico/agendar`)
Após a persistência bem-sucedida do agendamento e da notificação WhatsApp existente, chama o helper:
```javascript
notificarPushNovoAgendamento(db, env, {
  cliente_nome: nome,
  data: corpo.data,
  inicio_min: inicio,
  local,
  servicos,
  preco,
  token,
});
```
Formato do alerta:
- **Título:** `💅 Novo Agendamento Recebido!`
- **Corpo:**  
  `👤 ${cliente_nome} agendou ${servicosTexto}\n📅 ${dataFmt} às ${horaFmt} (${localTexto})\n💰 R$ ${precoTotalFmt}`
- **Tag:** `novo-agendamento-${id}`
- **URL destino:** `/admin/` (ao tocar na notificação, abre a agenda)

#### B. Ao Cancelar Agendamento (`POST /publico/agendamento/:token/cancelar`)
Após o cancelamento bem-sucedido e disparo do WhatsApp de cancelamento:
```javascript
notificarPushCancelamento(db, env, {
  cliente_nome: a.cliente_nome,
  data: a.data,
  inicio_min: a.inicio_min,
  servicos: a.servicos,
});
```
Formato do alerta:
- **Título:** `⚠️ Horário Cancelado`
- **Corpo:**  
  `${cliente_nome} desmarcou o atendimento de ${dataFmt} às ${horaFmt}.\nEsse horário já foi liberado na sua agenda para novas vagas.`
- **Tag:** `cancelamento-${id}`
- **URL destino:** `/admin/`

---

## 5. Frontend & Service Worker

### 5.1 Service Worker ([public/sw.js](file:///C:/Users/Ian%20&%20Jerusa/Documents/AppsCriacao/jeursa-beauty/public/sw.js))
Atualizar o service worker existente para escutar eventos de push e cliques:
- **Evento `'push'`:**
  - Extrai payload JSON contendo `{ title, body, icon, badge, data, tag }`.
  - Configura opções:
    - `icon`: `/img/icon-192.png`
    - `badge`: `/img/favicon.png`
    - `vibrate`: `[200, 100, 200]`
    - `tag`: tag do evento para não acumular notificações duplicadas
    - `renotify`: `true`
    - `data`: `{ url: payload.url || '/admin/' }`
  - Invoca `self.registration.showNotification(title, options)`.
- **Evento `'notificationclick'`:**
  - Fecha a notificação: `event.notification.close()`.
  - Verifica se já existe uma aba aberta de `/admin/`:
    - Se existir: foca nela (`client.focus()`) e recarrega os dados da agenda.
    - Se não existir: abre uma nova janela com a URL (`clients.openWindow(url)`).

### 5.2 Interface do Painel Administrativo ([public/admin/admin.js](file:///C:/Users/Ian%20&%20Jerusa/Documents/AppsCriacao/jeursa-beauty/public/admin/admin.js))
Na seção de Ajustes do painel:
- Card com título: `🔔 Notificações no Celular (Web Push)`.
- Verificação do suporte do navegador (`'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window`).
  - Se não suportado ou se for iPhone no navegador sem ter sido adicionado à tela inicial: orienta brevemente a tocar em "Compartilhar > Adicionar à Tela de Início".
- Estado atual:
  - Se inscrito: badge verde `🟢 Ativado neste aparelho`, botão `[ 🔕 Desativar ]` e botão `[ 🧪 Enviar Notificação de Teste ]`.
  - Se não inscrito: botão em destaque `[ 🔔 Ativar Notificações no meu Celular ]`.
- Ao clicar em "Ativar":
  1. Chama `Notification.requestPermission()`.
  2. Obtém chave pública VAPID via `GET /admin/push/chave-publica`.
  3. Converte a chave Base64URL em `Uint8Array`.
  4. Executa `swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
  5. Envia endpoint, p256dh e auth para `POST /admin/push/inscrever`.
  6. Atualiza o status visual para ativado.

---

## 6. Estratégia de Testes Automatizados

Criar arquivo de testes unitários dedicado: `test/push.test.js`:
1. **Geração e Importação de Chaves VAPID:** Verifica persistência e leitura das chaves no banco SQLite/D1.
2. **Cifragem Web Push AES-128-GCM:** Testa a cifragem de payload com chaves geradas via `crypto.subtle` validando conformidade binária RFC 8291.
3. **Assinatura VAPID:** Valida formação do header `Authorization: vapid t=..., k=...` e decodificação do JWT gerado.
4. **Fluxo de Inscrição e Desinscrição:** Testa endpoints `/admin/push/inscrever` e `/admin/push/desinscrever`.
5. **Tratamento de 410 Gone:** Garante que inscrições marcadas como 410/404 são devidamente excluídas do banco.
6. **Não-regressão:** Execução da suíte completa de testes (`npm test`) confirmando 100% de aprovação de todos os testes existentes.

---

## 7. Passos de Deploy para Produção (Cloudflare)

1. Executar migration no banco D1 remoto:
   ```bash
   wrangler d1 execute jussara-esmalteria --remote --command="CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, criado_em INTEGER NOT NULL, ultimo_sucesso INTEGER, falhas_consecutivas INTEGER NOT NULL DEFAULT 0);"
   ```
2. Realizar deploy no Cloudflare Pages:
   ```bash
   wrangler pages deploy public
   ```
3. Teste em produção: Acessar painel `/admin/`, ativar notificações no aparelho e disparar notificação de teste.

---

## 8. Critérios de Sucesso

- [x] Nenhuma funcionalidade anterior quebrada (WhatsApp, agendamento, financeiro).
- [x] Notificação de teste disparada pelo painel toca e vibra no celular cadastrado.
- [x] Novo agendamento pela página inicial dispara notificação imediata para o celular com detalhes (cliente, data, serviço, valor).
- [x] Cancelamento de cliente dispara notificação de alerta liberando o horário.
- [x] Todos os 30 testes existentes + novos testes de push passam com 100% de sucesso.
