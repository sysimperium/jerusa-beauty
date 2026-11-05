import test from 'node:test';
import assert from 'node:assert/strict';
import { despachar } from '../functions/_lib/router.js';
import '../functions/_lib/rotas-publicas.js';

class MockD1Database {
  constructor() {
    this.configs = new Map([
      ['nome_negocio', 'Jerusa Beauty'],
      ['sinal_ativo', '1'],
      ['sinal_porcentagem', '30'],
      ['sinal_prazo_horas', '2'],
      ['pix_tipo', 'telefone'],
      ['pix_chave', '83999990000'],
      ['pix_nome', 'Jerusa Beauty'],
      ['pix_cidade', 'Joao Pessoa'],
    ]);
    this.agendamentos = [];
  }

  prepare(sql) {
    const db = this;
    return {
      _params: [],
      bind(...params) {
        this._params = params;
        return this;
      },
      async all() {
        if (sql.includes('SELECT chave, valor FROM config')) {
          return {
            results: Array.from(db.configs.entries()).map(([chave, valor]) => ({ chave, valor })),
          };
        }
        if (sql.includes('SELECT id, nome, descricao, preco_centavos, duracao_min FROM servicos')) {
          return {
            results: [{ id: 1, nome: 'Manicure Completa', preco_centavos: 5000, duracao_min: 60, ativo: 1, ordem: 1 }],
          };
        }
        if (sql.includes('SELECT dia, ativo FROM expediente')) {
          return { results: [{ dia: 1, ativo: 1 }, { dia: 2, ativo: 1 }, { dia: 3, ativo: 1 }, { dia: 4, ativo: 1 }, { dia: 5, ativo: 1 }] };
        }
        if (sql.includes('SELECT s.agendamento_id')) {
          return { results: [{ agendamento_id: 1, servico_id: 1, nome: 'Manicure Completa', preco_centavos: 5000, duracao_min: 60 }] };
        }
        return { results: [] };
      },
      async first() {
        if (sql.includes('SELECT chave, valor FROM config')) {
          return null;
        }
        if (sql.includes('SELECT a.id, a.data, a.inicio_min')) {
          const token = this._params[0];
          const a = db.agendamentos.find((x) => x.token === token);
          if (!a) return null;
          return {
            id: a.id,
            data: a.data,
            inicio_min: a.inicio_min,
            duracao_min: a.duracao_min,
            local: a.local,
            endereco: a.endereco,
            referencia: a.referencia,
            preco_tabela_centavos: a.preco,
            status: a.status,
            sinal_status: a.sinal_status,
            sinal_porcentagem: a.sinal_porcentagem,
            sinal_valor_centavos: a.sinal_valor_centavos,
            sinal_pago: a.sinal_pago,
            cliente_nome: 'Maria Cliente',
            cliente_whatsapp: '5583999998888',
          };
        }
        return null;
      },
    };
  }

  async batch(stmts) {
    return [{ meta: { changes: 1 } }];
  }
}

test('sinal-publico: GET /publico/config retorna configuracoes de sinal e pix', async () => {
  const db = new MockD1Database();
  const req = new Request('https://jerusa-beauty.pages.dev/api/publico/config');
  const res = await despachar({ request: req, env: { DB: db } });
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.sinal_ativo, true);
  assert.equal(json.sinal_porcentagem, 30);
  assert.equal(json.sinal_prazo_horas, 2);
  assert.equal(json.pix_chave, '83999990000');
  assert.equal(json.pix_tipo, 'telefone');
});

test('sinal-publico: calculo do valor do sinal respeita percentual configurado', () => {
  const calcularSinal = (precoCentavos, pct) => Math.round((precoCentavos * pct) / 100);

  // R$ 50,00 a 30% = R$ 15,00 (1500 centavos)
  assert.equal(calcularSinal(5000, 30), 1500);

  // R$ 35,00 a 30% = R$ 10,50 (1050 centavos)
  assert.equal(calcularSinal(3500, 30), 1050);

  // R$ 33,33 a 30% = R$ 10,00 (1000 centavos)
  assert.equal(calcularSinal(3333, 30), 1000);

  // R$ 80,00 a 50% = R$ 40,00 (4000 centavos)
  assert.equal(calcularSinal(8000, 50), 4000);
});

test('sinal-publico: GET /publico/agendamento/:token retorna dados de sinal', async () => {
  const db = new MockD1Database();
  const token = '1234567890abcdef1234567890abcdef';
  db.agendamentos.push({
    id: 1,
    token,
    data: '2026-12-10',
    inicio_min: 600,
    duracao_min: 60,
    local: 'espaco',
    preco: 5000,
    status: 'agendado',
    sinal_status: 'pendente',
    sinal_porcentagem: 30,
    sinal_valor_centavos: 1500,
    sinal_pago: 0,
  });

  const req = new Request(`https://jerusa-beauty.pages.dev/api/publico/agendamento/${token}`);
  const res = await despachar({ request: req, env: { DB: db } });
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.sinal_status, 'pendente');
  assert.equal(json.sinal_porcentagem, 30);
  assert.equal(json.sinal_valor_centavos, 1500);
  assert.equal(json.sinal_pago, 0);
  assert.equal(json.pix_chave, '83999990000');
});
