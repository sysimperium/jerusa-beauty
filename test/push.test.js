import test from 'node:test';
import assert from 'node:assert/strict';
import {
  obterOuCriarChavesVapid,
  garantirTabelaPush,
  cifrarPayloadPush,
  gerarHeaderVapid,
  enviarPushParaAssinatura,
  dispararPushParaTodos,
  bytesToBase64Url,
} from '../functions/_lib/push.js';

class MockD1 {
  constructor() {
    this.config = new Map();
    this.subscriptions = [];
    this.tabelas = new Set();
  }

  prepare(sql) {
    const self = this;
    let binds = [];
    return {
      bind(...args) {
        binds = args;
        return this;
      },
      async first(col) {
        if (sql.includes('SELECT valor FROM config WHERE chave = ?1')) {
          const val = self.config.get(binds[0]);
          if (!val) return null;
          return col ? val : { valor: val };
        }
        return null;
      },
      async all() {
        if (sql.includes('SELECT * FROM push_subscriptions') || sql.includes('SELECT id, endpoint, p256dh, auth FROM push_subscriptions')) {
          return { results: [...self.subscriptions] };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes('CREATE TABLE IF NOT EXISTS push_subscriptions')) {
          self.tabelas.add('push_subscriptions');
          return { meta: { changes: 1 } };
        }
        if (sql.includes('INSERT INTO config')) {
          self.config.set(binds[0], binds[1]);
          return { meta: { changes: 1 } };
        }
        if (sql.includes('DELETE FROM push_subscriptions WHERE endpoint = ?1')) {
          const antes = self.subscriptions.length;
          self.subscriptions = self.subscriptions.filter((s) => s.endpoint !== binds[0]);
          return { meta: { changes: antes - self.subscriptions.length } };
        }
        if (sql.includes('UPDATE push_subscriptions')) {
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 1 } };
      },
    };
  }
}

test('push: cria tabela push_subscriptions e gera chaves VAPID automaticamente', async () => {
  const db = new MockD1();

  await garantirTabelaPush(db);
  assert.ok(db.tabelas.has('push_subscriptions'), 'Tabela push_subscriptions deve ser garantida');

  const chaves = await obterOuCriarChavesVapid(db);
  assert.ok(chaves.publicKey, 'Deve retornar chave pública VAPID');
  assert.ok(chaves.privateKeyJwk, 'Deve retornar JWK da chave privada');
  assert.match(chaves.subject, /mailto:|https:/);

  // Segunda chamada deve retornar as mesmas chaves salvas no banco
  const chavesRepetidas = await obterOuCriarChavesVapid(db);
  assert.equal(chavesRepetidas.publicKey, chaves.publicKey, 'Deve reutilizar a chave pública salva');
  assert.deepEqual(chavesRepetidas.privateKeyJwk, chaves.privateKeyJwk, 'Deve reutilizar a chave privada salva');
});

test('push: gera assinatura VAPID com formato vapid t=..., k=...', async () => {
  const db = new MockD1();
  const vapid = await obterOuCriarChavesVapid(db);
  const header = await gerarHeaderVapid('https://fcm.googleapis.com/fcm/send/fake-token', vapid);
  assert.match(header, /^vapid t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=[A-Za-z0-9_-]+$/);
});

test('push: cifra payload JSON conforme padrão RFC 8291 AES-128-GCM', async () => {
  // Gera par de chaves ECDH do cliente para simular o navegador
  const clientKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const rawClientPub = await crypto.subtle.exportKey('raw', clientKeys.publicKey);
  const clientP256dh = bytesToBase64Url(new Uint8Array(rawClientPub));
  const authSecretBytes = new Uint8Array(16);
  crypto.getRandomValues(authSecretBytes);
  const clientAuth = bytesToBase64Url(authSecretBytes);

  const payload = { title: 'Novo Agendamento', body: 'Camila agendou 14:00' };
  const encrypted = await cifrarPayloadPush({ p256dh: clientP256dh, auth: clientAuth }, payload);

  assert.ok(encrypted instanceof Uint8Array, 'Deve retornar um Uint8Array binário');
  // Cabeçalho RFC 8291: 16 bytes salt + 4 bytes record size + 1 byte key len (65) + 65 bytes pubkey = 86 bytes de cabeçalho
  assert.ok(encrypted.length > 86, 'Carga útil deve conter cabeçalho RFC 8291 de no mínimo 86 bytes');
  assert.equal(encrypted[20], 65, 'Comprimento da chave pública efêmera no cabeçalho deve ser 65');
});

test('push: remove assinatura quando serviço push retorna 410 Gone ou 404', async () => {
  const db = new MockD1();
  // Gera chaves válidas de cliente
  const clientKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const rawClientPub = await crypto.subtle.exportKey('raw', clientKeys.publicKey);
  const clientP256dh = bytesToBase64Url(new Uint8Array(rawClientPub));
  const authSecretBytes = new Uint8Array(16);
  crypto.getRandomValues(authSecretBytes);
  const clientAuth = bytesToBase64Url(authSecretBytes);

  db.subscriptions.push({
    id: 1,
    endpoint: 'https://web.push.apple.com/sub_expirada',
    p256dh: clientP256dh,
    auth: clientAuth,
  });

  const mockFetch = async () => ({ status: 410, ok: false });
  const ok = await enviarPushParaAssinatura(
    db,
    db.subscriptions[0],
    { title: 'Teste' },
    { fetchFn: mockFetch }
  );

  assert.equal(ok, false, 'Deve retornar falso quando falha com 410');
  assert.equal(db.subscriptions.length, 0, 'A assinatura 410 Gone deve ser excluída automaticamente');
});

