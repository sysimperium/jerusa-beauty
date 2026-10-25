// Pix estático (BR Code / EMV). Gera o "copia e cola" com valor a partir da chave da manicure.
// Não confirma pagamento: a baixa é manual no app.

export function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

const limpar = (s, max) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizarChave(tipo, chave) {
  const c = String(chave || '').trim();
  switch (tipo) {
    case 'cpf':
    case 'cnpj':
      return c.replace(/\D/g, '');
    case 'telefone': {
      let d = c.replace(/\D/g, '');
      if (!d) return '';
      if (!(d.startsWith('55') && d.length >= 12)) d = '55' + d;
      return '+' + d;
    }
    case 'email':
      return c.toLowerCase();
    default:
      return c;
  }
}

export function gerarBrCode({ tipo, chave, nome, cidade, valorCentavos, txid = '***' }) {
  const k = normalizarChave(tipo, chave);
  if (!k) throw new Error('Cadastre a chave Pix nos ajustes.');
  const beneficiario = limpar(nome, 25);
  const cidadeLimpa = limpar(cidade, 15);
  if (!beneficiario || !cidadeLimpa) throw new Error('Informe o nome e a cidade do Pix nos ajustes.');

  let p = campo('00', '01') + campo('01', '11');
  p += campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', k));
  p += campo('52', '0000') + campo('53', '986');
  if (valorCentavos > 0) p += campo('54', (valorCentavos / 100).toFixed(2));
  p += campo('58', 'BR') + campo('59', beneficiario) + campo('60', cidadeLimpa);
  p += campo('62', campo('05', txid));
  p += '6304';
  return p + crc16(p).toString(16).toUpperCase().padStart(4, '0');
}
