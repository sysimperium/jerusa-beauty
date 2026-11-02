import test from 'node:test';
import assert from 'node:assert/strict';
import { obterOuCriarChavesVapid, garantirTabelaPush } from '../functions/_lib/push.js';

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
        if (sql.includes('SELECT * FROM push_subscriptions')) {
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
