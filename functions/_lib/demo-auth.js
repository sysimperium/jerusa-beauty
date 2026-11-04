import { rota } from './router.js';
import { json, erro } from './util.js';
import {
  aleatorioHex, sha256Hex, cookieSessao, lerCookie
} from './auth.js';
import { URL_ROOT_PADRAO } from './licenca.js';

export function calcularTempoRestanteDemo(expiraEmMs, agoraMs = Date.now()) {
  const restante = expiraEmMs - agoraMs;
  if (restante <= 0) {
    return { expirado: true, restante_ms: 0 };
  }
  return { expirado: false, restante_ms: restante };
}

export function formatarContadorRegressivo(restanteMs) {
  if (restanteMs <= 0) return 'Tempo esgotado';
  const totalSeg = Math.floor(restanteMs / 1000);
  const horas = Math.floor(totalSeg / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const seg = totalSeg % 60;
  return `${String(horas).padStart(2, '0')}h ${String(min).padStart(2, '0')}m ${String(seg).padStart(2, '0')}s`;
}

export async function validarTokenCentral(token, urlRoot = URL_ROOT_PADRAO, fetchFn = fetch) {
  const url = `${urlRoot.replace(/\/+$/, '')}/api/demo/validar?token=${encodeURIComponent(token)}`;
  const resp = await fetchFn(url);
  if (!resp.ok) {
    throw erro(400, 'token_invalido', 'Token de demonstração não pôde ser validado na Central Root.');
  }
  return resp.json();
}

// Endpoint para autenticar prospecto usando token demo
rota('POST', '/demo/entrar', async ({ db, env, corpo }) => {
  const token = (corpo.token || '').trim();
  if (!token) throw erro(400, 'token_obrigatorio', 'Informe o token de demonstração.');

  const rootUrl = env.ROOT_URL || URL_ROOT_PADRAO;
  const dados = await validarTokenCentral(token, rootUrl);

  if (!dados.valido) {
    throw erro(403, 'token_expirado_ou_invalido', dados.motivo === 'expirado' 
      ? 'Seu período de teste já expirou. Fale com nosso suporte para adquirir sua versão definitiva!' 
      : 'Token de demonstração inválido ou revogado.');
  }

  // Cria sessão no D1 vinculada à expiração do token demo
  const sid = aleatorioHex(32);
  const sidHash = await sha256Hex(sid);
  const expiraEm = dados.expira_em;

  await db.batch([
    db.prepare('DELETE FROM sessoes WHERE expira_em < ?1').bind(Date.now()),
    db.prepare('INSERT INTO sessoes (token_hash, expira_em) VALUES (?1, ?2)').bind(sidHash, expiraEm),
  ]);

  return json({
    ok: true,
    demo: true,
    nome_prospect: dados.nome_prospect,
    expira_em: expiraEm,
    restante_ms: dados.restante_ms,
  }, 200, { 'set-cookie': cookieSessao(sid) });
});
