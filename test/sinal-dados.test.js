import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig, CHAVES_CONFIG, CHAVES_BOOL, CHAVES_NUM } from '../functions/_lib/util.js';
import { garantirColunasLembretes } from '../functions/_lib/whatsapp.js';
import { criarAgendamento } from '../functions/_lib/dominio.js';

class MockDbConfig {
  constructor(initialData = {}) {
    this.data = new Map(Object.entries(initialData));
  }
  prepare(sql) {
    const db = this;
    return {
      _params: [],
      bind(...params) {
        const stmt = db.prepare(sql);
        stmt._params = params;
        return stmt;
      },
      async all() {
        if (sql.includes('SELECT chave, valor FROM config')) {
          const results = [];
          for (const [chave, valor] of db.data.entries()) {
            results.push({ chave, valor });
          }
          return { results };
        }
        return { results: [] };
      },
    };
  }
}

test('sinal-dados: carregarConfig define padroes e le sinal_ativo, sinal_porcentagem e sinal_prazo_horas', async () => {
  const dbVazio = new MockDbConfig({});
  const cfgPadrao = await carregarConfig(dbVazio);

  assert.equal(cfgPadrao.sinal_ativo, false);
  assert.equal(cfgPadrao.sinal_porcentagem, 30);
  assert.equal(cfgPadrao.sinal_prazo_horas, 2);
  assert.ok(CHAVES_CONFIG.includes('sinal_ativo'));
  assert.ok(CHAVES_CONFIG.includes('sinal_porcentagem'));
  assert.ok(CHAVES_CONFIG.includes('sinal_prazo_horas'));
  assert.ok(CHAVES_BOOL.includes('sinal_ativo'));
  assert.ok(CHAVES_NUM.includes('sinal_porcentagem'));
  assert.ok(CHAVES_NUM.includes('sinal_prazo_horas'));

  const dbConfigurado = new MockDbConfig({
    sinal_ativo: '1',
    sinal_porcentagem: '50',
    sinal_prazo_horas: '4',
  });
  const cfg = await carregarConfig(dbConfigurado);
  assert.equal(cfg.sinal_ativo, true);
  assert.equal(cfg.sinal_porcentagem, 50);
  assert.equal(cfg.sinal_prazo_horas, 4);
});

test('sinal-dados: migracao adiciona colunas de sinal em agendamentos se ausentes', async () => {
  const colunasExistentes = ['id', 'cliente_id', 'data', 'inicio_min', 'status'];
  const alterCommands = [];

  const mockDb = {
    prepare(sql) {
      return {
        async all() {
          if (sql.includes('PRAGMA table_info(agendamentos)')) {
            return { results: colunasExistentes.map((name) => ({ name })) };
          }
          if (sql.includes('PRAGMA table_info(clientes)')) {
            return { results: [] };
          }
          return { results: [] };
        },
        async run() {
          alterCommands.push(sql);
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  await garantirColunasLembretes(mockDb);

  const sqls = alterCommands.join(';\n');
  assert.match(sqls, /sinal_status/);
  assert.match(sqls, /sinal_porcentagem/);
  assert.match(sqls, /sinal_valor_centavos/);
  assert.match(sqls, /sinal_pago/);
  assert.match(sqls, /sinal_pago_em/);
});

test('sinal-dados: criarAgendamento vincula campos de sinal ao inserir', async () => {
  const executedSqls = [];
  const boundParamsList = [];

  const mockDb = {
    prepare(sql) {
      return {
        bind(...params) {
          executedSqls.push(sql);
          boundParamsList.push(params);
          return this;
        },
      };
    },
    async batch(stmts) {
      return [{ meta: { changes: 1 } }];
    },
  };

  const cfg = { deslocamento_min: 15, respiro_min: 15 };
  const res = await criarAgendamento(mockDb, cfg, {
    cliente_id: 1,
    data: '2026-12-10',
    inicio_min: 600,
    duracao_min: 60,
    local: 'espaco',
    preco: 10000,
    token: 'tokenteste123456',
    origem: 'cliente',
    servicos: [{ id: 1, nome: 'Unhas Gel', preco_centavos: 10000, duracao_min: 60 }],
    sinal_status: 'pendente',
    sinal_porcentagem: 30,
    sinal_valor_centavos: 3000,
  });

  assert.equal(res, 'tokenteste123456');
  const insertSql = executedSqls.find((s) => s.includes('INSERT INTO agendamentos'));
  assert.ok(insertSql);
  assert.match(insertSql, /sinal_status/);
  assert.match(insertSql, /sinal_porcentagem/);
  assert.match(insertSql, /sinal_valor_centavos/);

  const insertParams = boundParamsList[0];
  assert.ok(insertParams.includes('pendente'));
  assert.ok(insertParams.includes(30));
  assert.ok(insertParams.includes(3000));
});
