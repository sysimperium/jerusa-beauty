import { HttpError, erro, json } from './util.js';
import { sessaoValida } from './auth.js';

const rotas = [];
let middlewareAntes = null;

export function definirMiddleware(fn) {
  middlewareAntes = fn;
}

export function rota(metodo, caminho, handler, { admin = false } = {}) {
  const nomes = [];
  const re = new RegExp('^' + caminho.replace(/:([a-z_]+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '/?$');
  rotas.push({ metodo, re, nomes, handler, admin });
}

async function lerJson(request) {
  const txt = await request.text();
  if (!txt) return {};
  try { return JSON.parse(txt); } catch { throw erro(400, 'json_invalido', 'Corpo da requisição inválido.'); }
}

export async function despachar({ request, env, waitUntil, ...resto }) {
  const url = new URL(request.url);
  const caminho = url.pathname.replace(/^\/api/, '') || '/';
  const metodo = request.method === 'HEAD' ? 'GET' : request.method;
  const wait = waitUntil || (resto?.ctx?.waitUntil ? resto.ctx.waitUntil.bind(resto.ctx) : null);
  try {
    if (!env.DB && !caminho.startsWith('/licenca')) throw erro(500, 'sem_banco', 'Banco D1 não configurado (binding DB).');

    if (middlewareAntes) {
      await middlewareAntes({ request, env, db: env.DB, url, caminho, metodo });
    }
    for (const r of rotas) {
      if (r.metodo !== metodo) continue;
      const m = r.re.exec(caminho);
      if (!m) continue;
      if (metodo !== 'GET') {
        const origem = request.headers.get('origin');
        if (origem && new URL(origem).host !== url.host) throw erro(403, 'origem_invalida', 'Origem não permitida.');
      }
      if (r.admin && !(await sessaoValida(env.DB, request))) {
        throw erro(401, 'nao_autenticado', 'Entre com a sua senha.');
      }
      const params = {};
      r.nomes.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
      const corpo = metodo === 'GET' || metodo === 'DELETE' ? null : await lerJson(request);
      return await r.handler({ request, env, db: env.DB, url, params, corpo, waitUntil: wait });
    }
    throw erro(404, 'nao_encontrado', 'Rota não encontrada.');
  } catch (e) {
    if (e instanceof HttpError) return json({ erro: e.codigo, mensagem: e.message, ...e.extra }, e.status, e.headers);
    console.error(e);
    return json({ erro: 'erro_interno', mensagem: 'Algo deu errado. Tente de novo.' }, 500);
  }
}
