import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('editar-agendamento-ui: public/admin/admin.js possui botão e tela de editar atendimento', () => {
  const code = readFileSync(join(__dirname, '../public/admin/admin.js'), 'utf8');

  assert.match(code, /data-acao="editar"/, 'Deve conter botão com data-acao="editar"');
  assert.match(code, /folhaEditarAtendimento/, 'Deve conter função folhaEditarAtendimento');
  assert.match(code, /ed-servicos/, 'Deve conter container de serviços para edição');
  assert.match(code, /ed-salvar/, 'Deve conter botão de salvar alterações');
});

test('editar-agendamento-backend: rotas-admin.js aceita servicos e forcar no PATCH /admin/agendamentos/:id', () => {
  const code = readFileSync(join(__dirname, '../functions/_lib/rotas-admin.js'), 'utf8');

  assert.match(code, /corpo\.servicos !== undefined/, 'Deve verificar corpo.servicos no PATCH');
  assert.match(code, /agendamento_servicos/, 'Deve atualizar a tabela agendamento_servicos');
  assert.match(code, /choque_horario/, 'Deve retornar choque_horario com detalhes em caso de conflito');
});
