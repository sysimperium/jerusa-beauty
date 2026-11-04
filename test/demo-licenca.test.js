import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularTempoRestanteDemo, formatarContadorRegressivo } from '../functions/_lib/demo-auth.js';
import { deveBloquearRequisicao, consultarLicencaCentral } from '../functions/_lib/licenca.js';

test('calcularTempoRestanteDemo identifica token válido e expirado', () => {
  const agora = 1776000000000;
  const futuro = agora + 3600000 * 2; // +2h
  const passado = agora - 1000;

  const resValido = calcularTempoRestanteDemo(futuro, agora);
  assert.equal(resValido.expirado, false);
  assert.equal(resValido.restante_ms, 7200000);

  const resExpirado = calcularTempoRestanteDemo(passado, agora);
  assert.equal(resExpirado.expirado, true);
  assert.equal(resExpirado.restante_ms, 0);
});

test('formatarContadorRegressivo formata corretamente horas minutos e segundos', () => {
  assert.equal(formatarContadorRegressivo(0), 'Tempo esgotado');
  assert.equal(formatarContadorRegressivo(-500), 'Tempo esgotado');
  // 1 hora, 15 min, 30 seg = 3600 + 900 + 30 = 4530 seg = 4530000 ms
  assert.equal(formatarContadorRegressivo(4530000), '01h 15m 30s');
});

test('deveBloquearRequisicao libera rotas essenciais e bloqueia administrativas se suspenso', () => {
  const licencaAtiva = { bloqueado: false };
  assert.equal(deveBloquearRequisicao(licencaAtiva, '/admin/atendimentos'), false);

  const licencaBloqueada = { bloqueado: true, mensagem: 'Mensalidade pendente' };
  // Rotas essenciais liberadas para consulta de status ou logout
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/licenca/status'), false);
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/admin/logout'), false);

  // Todas as demais rotas são rigorosamente bloqueadas quando suspenso
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/admin/estado'), true);
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/demo/entrar'), true);
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/admin/atendimentos'), true);
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/admin/servicos'), true);
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/publico/novo'), true);
  assert.equal(deveBloquearRequisicao(licencaBloqueada, '/publico/config'), true);
});

test('consultarLicencaCentral retorna status ativo em modo fallback/offline', async () => {
  const mockFetchFalha = async () => { throw new Error('Offline'); };
  const res = await consultarLicencaCentral({
    appId: 'jerusa-beauty',
    fetchFn: mockFetchFalha,
  });

  assert.equal(res.status, 'ativo');
  assert.equal(res.bloqueado, false);
  assert.equal(res.modo_offline, true);
});

import { selecionarFaturasVisiveis, classificarEstiloFatura } from '../public/js/comum.js';

test('selecionarFaturasVisiveis seleciona ciclo atual e próximos meses', () => {
  const faturas = [
    { mes_ano: '2026-08', status: 'pago' },
    { mes_ano: '2026-09', status: 'pago' },
    { mes_ano: '2026-10', status: 'pago' },
    { mes_ano: '2026-11', status: 'pendente' },
    { mes_ano: '2026-12', status: 'pendente' },
  ];
  const visiveis = selecionarFaturasVisiveis(faturas, '2026-10-15');
  assert.equal(visiveis.length, 3);
  assert.equal(visiveis[0].mes_ano, '2026-10');
  assert.equal(visiveis[1].mes_ano, '2026-11');
  assert.equal(visiveis[2].mes_ano, '2026-12');
});

test('classificarEstiloFatura classifica paga, atrasada e mês atual', () => {
  const faturaPaga = { mes_ano: '2026-10', data_vencimento: '2026-10-10', status: 'pago' };
  const estiloPago = classificarEstiloFatura(faturaPaga, '2026-10-15');
  assert.equal(estiloPago.tipo, 'paga');
  assert.equal(estiloPago.rotulo, '✓ Pago');

  const faturaAtrasada = { mes_ano: '2026-10', data_vencimento: '2026-10-10', status: 'pendente' };
  const estiloAtrasado = classificarEstiloFatura(faturaAtrasada, '2026-10-15');
  assert.equal(estiloAtrasado.tipo, 'atrasada');
  assert.equal(estiloAtrasado.rotulo, '⚠️ Atrasada');

  const faturaMesAtual = { mes_ano: '2026-10', data_vencimento: '2026-10-25', status: 'pendente' };
  const estiloMesAtual = classificarEstiloFatura(faturaMesAtual, '2026-10-15');
  assert.equal(estiloMesAtual.tipo, 'mes_atual');
});
