import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('pendentes-fechamento: public/admin/admin.js possui elementos de atendimentos pendentes de fechamento', () => {
  const code = readFileSync(join(__dirname, '../public/admin/admin.js'), 'utf8');

  // Verifica elementos na tela de Início (Dashboard)
  assert.match(code, /pendentes_fechamento/);
  assert.match(code, /btn-acao-fechar-atendimento/);
  assert.match(code, /btn-acao-falta-atendimento/);
  assert.match(code, /Atendimentos Pendentes de Fechamento/);

  // Verifica elementos na tela de Financeiro
  assert.match(code, /pendentes_fechamento_mes/);
  assert.match(code, /Fechamentos Pendentes no Mês/);
  assert.match(code, /btn-fin-concluir/);
  assert.match(code, /btn-fin-falta/);
});

test('pendentes-fechamento: functions/_lib/rotas-admin.js possui helper e endpoints atualizados', () => {
  const code = readFileSync(join(__dirname, '../functions/_lib/rotas-admin.js'), 'utf8');

  assert.match(code, /function listarPendentesFechamento/);
  assert.match(code, /pendentes_fechamento_mes/);
  assert.match(code, /pendentes_fechamento_centavos/);
  assert.match(code, /vencidos_anteriores_qtd/);
});
