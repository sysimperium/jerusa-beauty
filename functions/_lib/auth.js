import { erro } from './util.js';

const ITERACOES = 100000; // limite do PBKDF2 no Cloudflare Workers
const enc = new TextEncoder();

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const aleatorioHex = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256Hex(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

export async function derivarSenha(senha, saltHex) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(saltHex), iterations: ITERACOES }, chave, 256);
  return hex(bits);
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function definirSenha(db, senha) {
  const salt = aleatorioHex(16);
  const hash = await derivarSenha(senha, salt);
  await db.prepare(
    'INSERT INTO admin (id, senha_hash, senha_salt) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET senha_hash = ?1, senha_salt = ?2'
  ).bind(hash, salt).run();
}

export async function senhaConfere(db, senha) {
  const row = await db.prepare('SELECT senha_hash, senha_salt FROM admin WHERE id = 1').first();
  if (!row) return false;
  return iguais(await derivarSenha(senha, row.senha_salt), row.senha_hash);
}

export async function adminExiste(db) {
  return !!(await db.prepare('SELECT 1 AS ok FROM admin WHERE id = 1').first());
}

export function validarSenhaNova(s) {
  if (typeof s !== 'string' || s.length < 6) throw erro(400, 'senha_curta', 'A senha precisa ter pelo menos 6 caracteres.');
  if (s.length > 100) throw erro(400, 'senha_longa', 'Senha muito longa.');
}

export function lerCookie(request, nome) {
  const c = request.headers.get('cookie') || '';
  for (const parte of c.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

const SESSAO_DIAS = 60;

export async function criarSessao(db) {
  const token = aleatorioHex(32);
  const agora = Date.now();
  await db.batch([
    db.prepare('DELETE FROM sessoes WHERE expira_em < ?1').bind(agora),
    db.prepare('INSERT INTO sessoes (token_hash, expira_em) VALUES (?1, ?2)')
      .bind(await sha256Hex(token), agora + SESSAO_MS()),
  ]);
  return token;
}
const SESSAO_MS = () => SESSAO_DIAS * 86400000;

export const cookieSessao = (token) =>
  `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSAO_DIAS * 86400}`;
export const cookieLimpo = () => 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

export async function sessaoValida(db, request) {
  const token = lerCookie(request, 'sid');
  if (!token || token.length < 32) return false;
  const row = await db.prepare('SELECT expira_em FROM sessoes WHERE token_hash = ?1')
    .bind(await sha256Hex(token)).first();
  return !!row && row.expira_em > Date.now();
}

export async function encerrarSessao(db, request) {
  const token = lerCookie(request, 'sid');
  if (token) await db.prepare('DELETE FROM sessoes WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
}

export async function encerrarTodasSessoes(db) {
  await db.prepare('DELETE FROM sessoes').run();
}

const MAX_TENTATIVAS = 5;
const JANELA_MS = 15 * 60000;

export async function checarTentativas(db, ip) {
  const desde = Date.now() - JANELA_MS;
  const r = await db.prepare('SELECT COUNT(*) AS n FROM tentativas_login WHERE ip = ?1 AND criado_em > ?2').bind(ip, desde).first();
  if (r.n >= MAX_TENTATIVAS) {
    throw erro(429, 'muitas_tentativas', 'Muitas tentativas erradas. Tente de novo em 15 minutos.');
  }
}
export async function registrarFalha(db, ip) {
  await db.batch([
    db.prepare('DELETE FROM tentativas_login WHERE criado_em < ?1').bind(Date.now() - JANELA_MS),
    db.prepare('INSERT INTO tentativas_login (ip, criado_em) VALUES (?1, ?2)').bind(ip, Date.now()),
  ]);
}
export async function limparFalhas(db, ip) {
  await db.prepare('DELETE FROM tentativas_login WHERE ip = ?1').bind(ip).run();
}
