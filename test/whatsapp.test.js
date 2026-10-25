import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getZapUrl,
  getZapKey,
  getAppId,
  notificarAgendamentoZap,
  notificarCancelamentoZap,
} from '../functions/_lib/whatsapp.js';

test('whatsapp: getZapUrl retorna URL padrão sem barra no final', () => {
  assert.equal(getZapUrl({}), 'https://meustudio-zap.onrender.com');
  assert.equal(getZapUrl({ ZAP_SERVICE_URL: 'https://custom.zap.com/' }), 'https://custom.zap.com');
});

test('whatsapp: getAppId retorna jerusa-beauty por padrão', () => {
  assert.equal(getAppId({}), 'jerusa-beauty');
  assert.equal(getAppId({ APP_ID: 'outro-studio' }), 'outro-studio');
});

test('whatsapp: getZapKey retorna a chave padrão', () => {
  assert.equal(getZapKey({}), 'meustudio_zap_secret_2026');
});

test('whatsapp: formatação dos lembretes de 24h e 2h', async () => {
  const { formatarMensagemLembrete24h, formatarMensagemLembrete2h } = await import('../functions/_lib/whatsapp.js');
  const cfg = { nome_negocio: 'Jussara Esmalteria', endereco_espaco: 'Rua das Flores, 123' };
  const agendamento = {
    cliente_nome: 'Mariana Silva',
    data: '2026-10-30',
    inicio_min: 600, // 10:00
    local: 'espaco',
    servicos: [{ nome: 'Manicure Completa' }],
  };

  const msg24h = formatarMensagemLembrete24h(cfg, agendamento);
  assert.match(msg24h, /Mariana Silva/);
  assert.match(msg24h, /Jussara Esmalteria/);
  assert.match(msg24h, /30\/10\/2026/);
  assert.match(msg24h, /10:00/);
  assert.match(msg24h, /Manicure Completa/);

  const msg2h = formatarMensagemLembrete2h(cfg, agendamento);
  assert.match(msg2h, /Mariana Silva/);
  assert.match(msg2h, /Jussara Esmalteria/);
  assert.match(msg2h, /10:00/);
});

test('whatsapp: formatação da mensagem carinhosa de fidelização', async () => {
  const { formatarMensagemFidelizacao } = await import('../functions/_lib/whatsapp.js');
  const cfg = { nome_negocio: 'Jussara Esmalteria' };
  const cliente = { nome: 'Carla Fernanda' };
  const link = 'https://jussara-esmalteria.pages.dev/';

  const msg = formatarMensagemFidelizacao(cfg, cliente, link);
  assert.match(msg, /Carla/);
  assert.match(msg, /Jussara Esmalteria/);
  assert.match(msg, /Sentimos sua falta/);
  assert.match(msg, /https:\/\/jussara-esmalteria\.pages\.dev\//);
});

test('whatsapp: notificarAgendamentoZap envia apenas para a cliente e nunca para a profissional', async (t) => {
  const chamadas = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    chamadas.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ sucesso: true }) };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const cfg = {
    nome_negocio: 'Jerusa Beauty',
    whatsapp: '8396677643', // Telefone da profissional
  };
  const agendamento = {
    cliente_nome: 'Ana Clara',
    cliente_whatsapp: '83988212971',
    data: '2026-10-26',
    inicio_min: 840,
    servicos: [{ nome: 'Alongamento em Gel' }],
    local: 'espaco',
    token: 'tok_123',
  };

  await notificarAgendamentoZap({}, cfg, agendamento);

  assert.equal(chamadas.length, 1, 'Deve enviar exatamente 1 mensagem');
  assert.equal(chamadas[0].body.para, '5583988212971', 'Deve enviar para o número normalizado da cliente');
  assert.match(chamadas[0].body.mensagem, /Olá, \*Ana Clara\*/);
  assert.match(chamadas[0].body.mensagem, /https:\/\/jerusa-beauty\.pages\.dev\/\?a=tok_123/);
});

test('whatsapp: notificarCancelamentoZap envia apenas para a cliente e sem texto desnecessário', async (t) => {
  const chamadas = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    chamadas.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ sucesso: true }) };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const cfg = {
    nome_negocio: 'Jerusa Beauty',
    whatsapp: '8396677643', // Telefone da profissional
  };
  const agendamento = {
    cliente_nome: 'Camila Santos',
    cliente_whatsapp: '83988212971',
    data: '2026-10-26',
    inicio_min: 840,
    servicos: [{ nome: 'Manicure' }],
    cancelado_por_admin: false,
  };

  await notificarCancelamentoZap({}, cfg, agendamento);

  assert.equal(chamadas.length, 1, 'Deve enviar exatamente 1 mensagem de cancelamento');
  assert.equal(chamadas[0].body.para, '5583988212971', 'Deve enviar para o número da cliente');
  assert.doesNotMatch(chamadas[0].body.mensagem, /liberado com sucesso/i, 'Não deve conter mensagem de horário liberado');
});

test('whatsapp: garantirColunasLembretes adiciona cancelamento_dispensado quando ausente', async () => {
  const { garantirColunasLembretes } = await import('../functions/_lib/whatsapp.js');
  const sqls = [];
  const db = {
    prepare(sql) {
      sqls.push(sql);
      return {
        all: async () => {
          if (sql.includes('table_info(agendamentos)')) {
            return { results: [{ name: 'id' }, { name: 'data' }] };
          }
          if (sql.includes('table_info(clientes)')) {
            return { results: [{ name: 'id' }] };
          }
          return { results: [] };
        },
        run: async () => ({}),
      };
    },
  };

  await garantirColunasLembretes(db);
  const adicionouCancelamentoDispensado = sqls.some((s) => s.includes('ADD COLUMN cancelamento_dispensado'));
  assert.equal(adicionouCancelamentoDispensado, true, 'Deve executar ALTER TABLE para adicionar cancelamento_dispensado');
});




