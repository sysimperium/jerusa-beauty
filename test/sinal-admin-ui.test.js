import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('sinal-admin-ui: public/admin/admin.js possui funcoes e elementos de sinal', () => {
  const code = readFileSync(join(__dirname, '../public/admin/admin.js'), 'utf8');

  // Verifica presença de tratamento de sinal_status e tempo de espera
  assert.match(code, /sinal_status/);
  assert.match(code, /tempoAguardandoSinal/);
  assert.match(code, /confirmar-sinal/);
  assert.match(code, /recusar-sinal/);
  assert.match(code, /lembrar-sinal/);

  // Verifica configurações de sinal acessíveis na guia agenda
  assert.match(code, /folhaConfigSinal/);

  // Verifica filtro rápido
  assert.match(code, /filtro-sinal|filtro-rapido|aguardando_sinal|sinal_pendentes/);
});
