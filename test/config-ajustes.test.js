import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig, CHAVES_CONFIG, CHAVES_BOOL, CHAVES_NUM, inteiro, texto, normalizarWhatsapp } from '../functions/_lib/util.js';
import { normalizarChave } from '../public/js/pix.js';

class MockDb {
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
      async run() {
        return { meta: { changes: 1 } };
      }
    };
  }
  async batch(statements) {
    for (const stmt of statements) {
      const [chave, valor] = stmt._params;
      this.data.set(chave, valor);
    }
    return [];
  }
}

test('ao desativar atende_domicilio em ajustes, deve salvar atende_domicilio como false sem falhar em pix_tipo', async () => {
  // Simula banco com dados iniciais (incluindo pix_tipo legado 'chave' ou vazio)
  const db = new MockDb({
    nome_negocio: 'Lauani Souza',
    whatsapp: '5543999789869',
    atende_espaco: '1',
    atende_domicilio: '1',
    pix_tipo: 'chave',
  });

  const atual = await carregarConfig(db);
  assert.equal(atual.atende_domicilio, true);

  // Payload enviado ao desmarcar 'Atendo a domicílio' e manter tipo pix inicial
  const corpo = {
    nome_negocio: 'Lauani Souza',
    whatsapp: '(43) 99978-9869',
    atende_espaco: true,
    endereco_espaco: '',
    atende_domicilio: false,
    respiro_min: 15,
    deslocamento_min: 15,
    antecedencia_min: 60,
    janela_dias: 30,
    passo_min: 30,
    cancelar_horas: 12,
    encaixar_colado: true,
    alerta_sumidos_dias: 15,
    pix_tipo: atual.pix_tipo, // 'chave'
    pix_chave: '',
    pix_nome: 'Lauani Souza',
    pix_cidade: '',
  };

  // Lógica de PUT /admin/config
  const LIMITES = {
    respiro_min: [0, 120], deslocamento_min: [0, 180], antecedencia_min: [0, 10080],
    janela_dias: [1, 365], passo_min: [5, 120], cancelar_horas: [0, 240],
    alerta_sumidos_dias: [3, 365],
  };

  const novo = { ...atual };
  for (const k of CHAVES_CONFIG) {
    if (!(k in corpo)) continue;
    const v = corpo[k];
    if (CHAVES_NUM.includes(k)) novo[k] = inteiro(v, ...LIMITES[k], k.replace(/_/g, ' '));
    else if (CHAVES_BOOL.includes(k)) novo[k] = !!v;
    else if (k === 'whatsapp') novo[k] = v ? normalizarWhatsapp(v) : '';
    else if (k === 'pix_tipo') {
      const vNorm = v === 'chave' || !v ? 'telefone' : v;
      if (!['cpf', 'cnpj', 'telefone', 'email', 'aleatoria'].includes(vNorm)) {
        throw new Error('Tipo de chave Pix inválido.');
      }
      novo[k] = vNorm;
    } else {
      const max = { nome_negocio: 80, endereco_espaco: 200, pix_chave: 80, pix_nome: 25, pix_cidade: 15 }[k];
      novo[k] = texto(v, max, k.replace(/_/g, ' '));
    }
  }

  assert.equal(novo.atende_domicilio, false);
  assert.equal(novo.atende_espaco, true);

  const stmt = db.prepare('INSERT INTO config (chave, valor) VALUES (?1, ?2)');
  await db.batch(CHAVES_CONFIG.map((k) => {
    const v = novo[k];
    return stmt.bind(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v ?? ''));
  }));

  // Recarrega do banco e confirma que atende_domicilio agora é false
  const cfgRecarregada = await carregarConfig(db);
  assert.equal(cfgRecarregada.atende_domicilio, false);
  assert.equal(cfgRecarregada.atende_espaco, true);
});

test('normalizarChave com telefone vazio ou sem dígitos retorna string vazia', () => {
  assert.equal(normalizarChave('telefone', ''), '');
  assert.equal(normalizarChave('telefone', '   '), '');
  assert.equal(normalizarChave('telefone', 'abc'), '');
  assert.equal(normalizarChave('cpf', ''), '');
  assert.equal(normalizarChave('cnpj', ''), '');
  assert.equal(normalizarChave('email', ''), '');
});

test('salvar ajustes com campos de Pix vazios e cidade longa salva normalmente', async () => {
  const db = new MockDb({
    nome_negocio: 'Lauani Souza',
    whatsapp: '5543999789869',
    atende_espaco: '1',
    atende_domicilio: '1',
  });

  const atual = await carregarConfig(db);
  const corpo = {
    nome_negocio: 'Lauani Souza Nails',
    whatsapp: '43999789869',
    atende_espaco: true,
    atende_domicilio: false,
    respiro_min: 15,
    deslocamento_min: 15,
    antecedencia_min: 60,
    janela_dias: 30,
    passo_min: 30,
    cancelar_horas: 12,
    encaixar_colado: true,
    alerta_sumidos_dias: 15,
    pix_tipo: '', // vazio
    pix_chave: '', // vazio
    pix_nome: '', // vazio
    pix_cidade: 'Cornélio Procópio - PR', // > 15 chars
  };

  const LIMITES = {
    respiro_min: [0, 120], deslocamento_min: [0, 180], antecedencia_min: [0, 10080],
    janela_dias: [1, 365], passo_min: [5, 120], cancelar_horas: [0, 240],
    alerta_sumidos_dias: [3, 365],
  };

  const novo = { ...atual };
  for (const k of CHAVES_CONFIG) {
    if (!(k in corpo)) continue;
    const v = corpo[k];
    if (CHAVES_NUM.includes(k)) novo[k] = inteiro(v, ...LIMITES[k], k.replace(/_/g, ' '));
    else if (CHAVES_BOOL.includes(k)) novo[k] = !!v;
    else if (k === 'whatsapp') novo[k] = v ? normalizarWhatsapp(v) : '';
    else if (k === 'pix_tipo') {
      const vNorm = v === 'chave' || !v ? 'telefone' : String(v).trim().toLowerCase();
      novo[k] = ['cpf', 'cnpj', 'telefone', 'email', 'aleatoria'].includes(vNorm) ? vNorm : 'telefone';
    } else if (k === 'pix_cidade') {
      novo[k] = v ? String(v).trim().slice(0, 15) : '';
    } else if (k === 'pix_nome') {
      novo[k] = v ? String(v).trim().slice(0, 25) : '';
    } else if (k === 'pix_chave') {
      novo[k] = v ? String(v).trim().slice(0, 80) : '';
    } else {
      const max = { nome_negocio: 80, endereco_espaco: 200 }[k];
      novo[k] = texto(v, max, k.replace(/_/g, ' '));
    }
  }

  assert.equal(novo.atende_domicilio, false);
  assert.equal(novo.pix_tipo, 'telefone');
  assert.equal(novo.pix_chave, '');
  assert.equal(novo.pix_cidade, 'Cornélio Procóp'); // Truncada em 15 chars sem erro

  const stmt = db.prepare('INSERT INTO config (chave, valor) VALUES (?1, ?2)');
  await db.batch(CHAVES_CONFIG.map((k) => {
    const v = novo[k];
    return stmt.bind(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v ?? ''));
  }));

  const salva = await carregarConfig(db);
  assert.equal(salva.atende_domicilio, false);
  assert.equal(salva.pix_chave, '');
});
