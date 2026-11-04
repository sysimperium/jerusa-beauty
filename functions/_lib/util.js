export class HttpError extends Error {
  constructor(status, codigo, mensagem, headers = {}, extra = {}) {
    super(mensagem);
    this.status = status;
    this.codigo = codigo;
    this.headers = headers;
    this.extra = extra;
  }
}
export const erro = (status, codigo, mensagem, headers, extra) => new HttpError(status, codigo, mensagem, headers, extra);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function inteiro(v, min, max, rotulo) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) {
    throw erro(400, 'dado_invalido', `${rotulo} inválido.`);
  }
  return n;
}

export function texto(v, max, rotulo, { obrigatorio = false, min = 0 } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (obrigatorio && s.length === 0) throw erro(400, 'dado_invalido', `Informe ${rotulo}.`);
  if (s.length > 0 && s.length < min) throw erro(400, 'dado_invalido', `${rotulo} muito curto.`);
  if (s.length > max) throw erro(400, 'dado_invalido', `${rotulo} muito longo (máx. ${max}).`);
  return s;
}

// Guarda só dígitos, com DDI 55. Aceita (83) 99999-0000, 83999990000, +55 83 99999-0000.
export function normalizarWhatsapp(v) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (!/^55\d{10,11}$/.test(d)) throw erro(400, 'dado_invalido', 'WhatsApp inválido. Use DDD + número.');
  return d;
}

const NUM = ['respiro_min', 'deslocamento_min', 'antecedencia_min', 'janela_dias', 'passo_min', 'cancelar_horas', 'alerta_sumidos_dias'];
const BOOL = ['atende_espaco', 'atende_domicilio', 'encaixar_colado', 'exibir_whatsapp_bio'];
const PADRAO = {
  nome_negocio: 'Jerusa Beauty', whatsapp: '', endereco_espaco: '',
  ramo_atividade: 'Manicure & Nail Designer',
  slogan: 'Cuidado, elegância e beleza para suas unhas com atendimento exclusivo e personalizado.',
  exibir_whatsapp_bio: true,
  logo_customizada: '',
  respiro_min: 15, deslocamento_min: 15, antecedencia_min: 60, janela_dias: 30, passo_min: 30, cancelar_horas: 12,
  alerta_sumidos_dias: 15,
  atende_espaco: true, atende_domicilio: true, encaixar_colado: true,
  pix_tipo: 'telefone', pix_chave: '', pix_nome: '', pix_cidade: '',
};

export async function carregarConfig(db) {
  const { results } = await db.prepare('SELECT chave, valor FROM config').all();
  const cfg = { ...PADRAO };
  for (const { chave, valor } of results) {
    if (!(chave in PADRAO)) continue;
    if (NUM.includes(chave)) cfg[chave] = Number.isFinite(Number(valor)) ? Number(valor) : PADRAO[chave];
    else if (BOOL.includes(chave)) cfg[chave] = valor === '1' || valor === 'true';
    else cfg[chave] = valor;
  }
  if (cfg.passo_min < 5) cfg.passo_min = 30;
  return cfg;
}

export const CHAVES_CONFIG = Object.keys(PADRAO);
export const CHAVES_NUM = NUM;
export const CHAVES_BOOL = BOOL;
