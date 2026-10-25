import test from 'node:test';
import assert from 'node:assert/strict';
import { getZapUrl, getZapKey, getAppId, notificarAgendamentoZap } from '../functions/_lib/whatsapp.js';

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


