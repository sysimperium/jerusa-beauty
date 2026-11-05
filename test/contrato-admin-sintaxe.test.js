import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(__dirname, '..');

test('frontend admin: public/admin/admin.js possui sintaxe JavaScript válida', () => {
  const adminJsPath = path.join(raiz, 'public', 'admin', 'admin.js');
  assert.doesNotThrow(() => {
    execSync(`node --check "${adminJsPath}"`, { stdio: 'pipe' });
  });
});

test('frontend admin: public/admin/js/contrato-pdf.js possui sintaxe JavaScript válida', () => {
  const pdfJsPath = path.join(raiz, 'public', 'admin', 'js', 'contrato-pdf.js');
  assert.doesNotThrow(() => {
    execSync(`node --check "${pdfJsPath}"`, { stdio: 'pipe' });
  });
});
