import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('bio/index.html: OpenGraph e metatags para Instagram/WhatsApp de Jerusa Beauty', () => {
  const bioHtml = fs.readFileSync(path.join(rootDir, 'public', 'bio', 'index.html'), 'utf-8');

  assert.match(bioHtml, /<meta property="og:image" content="https:\/\/jerusa-beauty\.pages\.dev\/img\/logo-preview\.png"/i);
  assert.match(bioHtml, /<meta property="og:title" content="[^"]*Jerusa Beauty[^"]*"/i);
  assert.match(bioHtml, /<meta name="twitter:image" content="https:\/\/jerusa-beauty\.pages\.dev\/img\/logo-preview\.png"/i);
  assert.match(bioHtml, /<meta name="twitter:card" content="summary_large_image"/i);
});

test('public/index.html: OpenGraph e metatags de Jerusa Beauty', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf-8');

  assert.match(indexHtml, /<meta property="og:image" content="https:\/\/jerusa-beauty\.pages\.dev\/img\/logo-preview\.png"/i);
  assert.match(indexHtml, /<meta property="og:title" content="[^"]*Jerusa Beauty[^"]*"/i);
});

test('public/img: logo-preview.png deve existir', () => {
  const previewPath = path.join(rootDir, 'public', 'img', 'logo-preview.png');
  assert.ok(fs.existsSync(previewPath), 'logo-preview.png deve existir em public/img');
});
