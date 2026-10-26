import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairDiaMesAniversario, formatarMensagemAniversario, ehAniversarioHoje } from '../functions/_lib/whatsapp.js';

test('extrairDiaMesAniversario: extrai dia e mês válidos', () => {
  assert.deepEqual(extrairDiaMesAniversario('15/08'), { dia: 15, mes: 8 });
  assert.deepEqual(extrairDiaMesAniversario('05/1'), { dia: 5, mes: 1 });
  assert.deepEqual(extrairDiaMesAniversario('31/12'), { dia: 31, mes: 12 });
  assert.deepEqual(extrairDiaMesAniversario(' 20 / 05 '), { dia: 20, mes: 5 });
});

test('extrairDiaMesAniversario: retorna null para datas inválidas ou vazias', () => {
  assert.equal(extrairDiaMesAniversario(''), null);
  assert.equal(extrairDiaMesAniversario(null), null);
  assert.equal(extrairDiaMesAniversario(undefined), null);
  assert.equal(extrairDiaMesAniversario('32/01'), null);
  assert.equal(extrairDiaMesAniversario('15/13'), null);
  assert.equal(extrairDiaMesAniversario('abc'), null);
});

test('ehAniversarioHoje: identifica corretamente se a cliente faz aniversário na data', () => {
  const cliente1 = { aniversario_dia: 25, aniversario_mes: 10 };
  const cliente2 = { aniversario_dia: 10, aniversario_mes: 5 };
  const clienteSem = { aniversario_dia: null, aniversario_mes: null };

  assert.equal(ehAniversarioHoje(cliente1, '2026-10-25'), true);
  assert.equal(ehAniversarioHoje(cliente1, '2026-10-26'), false);
  assert.equal(ehAniversarioHoje(cliente2, '2026-10-25'), false);
  assert.equal(ehAniversarioHoje(clienteSem, '2026-10-25'), false);
});

test('formatarMensagemAniversario: gera texto elegante com nome e link sem prometer mimo ou limitar a unhas', () => {
  const cfg = { nome_negocio: 'Jerusa Beauty' };
  const cliente = { nome: 'Maria Silva' };
  const link = 'https://jerusa-beauty.pages.dev/';

  const msg = formatarMensagemAniversario(cfg, cliente, link);
  assert.match(msg, /Maria/);
  assert.match(msg, /Jerusa Beauty/);
  assert.match(msg, /se presentear|cuidar de voc/i);
  assert.match(msg, /renovar a sua beleza/i);
  assert.doesNotMatch(msg, /mimo/i);
  assert.doesNotMatch(msg, /unhas/i);
  assert.match(msg, /https:\/\/jerusa-beauty\.pages\.dev\//);
});
