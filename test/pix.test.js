import test from 'node:test';
import assert from 'node:assert/strict';
import { crc16, gerarBrCode, normalizarChave } from '../public/js/pix.js';

test('CRC16-CCITT-FALSE bate com o vetor padrão', () => {
  assert.equal(crc16('123456789'), 0x29b1);
});

function ler(payload) {
  const campos = {};
  for (let i = 0; i < payload.length;) {
    const id = payload.slice(i, i + 2), len = Number(payload.slice(i + 2, i + 4));
    campos[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return campos;
}

test('BR Code estático com valor é consistente', () => {
  const p = gerarBrCode({ tipo: 'telefone', chave: '(83) 99999-0000', nome: 'Jussara Soares', cidade: 'Campina Grande', valorCentavos: 4500 });
  const c = ler(p);
  assert.equal(c['00'], '01');
  assert.equal(c['01'], '11');
  assert.equal(c['54'], '45.00');
  assert.equal(c['58'], 'BR');
  assert.equal(c['59'], 'JUSSARA SOARES');
  assert.equal(c['60'], 'CAMPINA GRANDE');
  assert.equal(c['53'], '986');
  assert.equal(ler(c['26'])['00'], 'br.gov.bcb.pix');
  assert.equal(ler(c['26'])['01'], '+5583999990000');
  assert.equal(ler(c['62'])['05'], '***');
  // CRC: últimos 4 caracteres conferem com o resto
  const corpo = p.slice(0, -4);
  assert.equal(p.slice(-4), crc16(corpo).toString(16).toUpperCase().padStart(4, '0'));
  assert.match(p, /6304[0-9A-F]{4}$/);
});

test('normaliza chaves e remove acentos do beneficiário', () => {
  assert.equal(normalizarChave('cpf', '123.456.789-09'), '12345678909');
  assert.equal(normalizarChave('email', ' Jussara@Email.COM '), 'jussara@email.com');
  assert.equal(normalizarChave('telefone', '+55 83 99999-0000'), '+5583999990000');
  const c = ler(gerarBrCode({ tipo: 'email', chave: 'a@b.com', nome: 'Jussara Conceição', cidade: 'João Pessoa', valorCentavos: 100 }));
  assert.equal(c['59'], 'JUSSARA CONCEICAO');
  assert.equal(c['60'], 'JOAO PESSOA');
});

test('sem valor omite o campo 54 e exige chave/nome/cidade', () => {
  const c = ler(gerarBrCode({ tipo: 'aleatoria', chave: 'abc-123', nome: 'X', cidade: 'Y', valorCentavos: 0 }));
  assert.equal(c['54'], undefined);
  assert.throws(() => gerarBrCode({ tipo: 'cpf', chave: '', nome: 'X', cidade: 'Y', valorCentavos: 1 }));
  assert.throws(() => gerarBrCode({ tipo: 'cpf', chave: '1', nome: '', cidade: 'Y', valorCentavos: 1 }));
});
