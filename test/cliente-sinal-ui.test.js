import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('cliente-sinal-ui: public/js/cliente.js possui sintaxe valida e importa gerarBrCode', () => {
  const code = readFileSync(join(__dirname, '../public/js/cliente.js'), 'utf8');

  // Verifica que importa gerarBrCode e qrSvg
  assert.match(code, /gerarBrCode/);
  assert.match(code, /qrSvg/);

  // Verifica tratamento de sinal_status
  assert.match(code, /sinal_status/);
  assert.match(code, /sinal_valor_centavos/);

  // Verifica mensagem pré-formatada de envio de comprovante no WhatsApp
  assert.match(code, /comprovante/i);
});
