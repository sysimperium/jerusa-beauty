import { json, erro } from './util.js';
import { rota, definirMiddleware } from './router.js';

export const URL_ROOT_PADRAO = 'https://root-sysimperium.pages.dev';
export const APP_ID_PADRAO = 'jerusa-beauty';
export const CHAVE_LICENCA_PADRAO = 'chave-jerusabeauty-imperium-2026';

export async function consultarLicencaCentral({
  appId,
  chave,
  urlRoot,
  db,
  env = {},
  fetchFn = fetch,
}) {
  const idReal = appId || env.APP_ID || APP_ID_PADRAO;
  const chaveReal = chave || env.CHAVE_LICENCA || CHAVE_LICENCA_PADRAO;
  const urlBase = urlRoot || env.ROOT_URL || URL_ROOT_PADRAO;

  try {
    const urlConsulta = `${urlBase.replace(/\/+$/, '')}/api/licenca/verificar?app_id=${encodeURIComponent(idReal)}&chave=${encodeURIComponent(chaveReal)}`;
    const resp = await fetchFn(urlConsulta, {
      method: 'GET',
      headers: { 'accept': 'application/json' },
    });

    if (resp.ok) {
      const dados = await resp.json();
      if (db) {
        try {
          await db.prepare(`
            INSERT INTO cache_licenca (id, status, dados_json, atualizado_em)
            VALUES (1, ?1, ?2, ?3)
            ON CONFLICT(id) DO UPDATE SET status = ?1, dados_json = ?2, atualizado_em = ?3
          `).bind(dados.status, JSON.stringify(dados), Date.now()).run();
        } catch (e) {
          console.warn('Falha ao gravar cache_licenca:', e);
        }
      }
      return dados;
    }
  } catch (err) {
    console.warn('Central Root inacessível momentaneamente:', err.message);
  }

  // Fallback para cache local no banco D1
  if (db) {
    try {
      const row = await db.prepare('SELECT dados_json, status FROM cache_licenca WHERE id = 1').first();
      if (row && row.dados_json) {
        return JSON.parse(row.dados_json);
      }
    } catch (e) {
      console.warn('Falha ao ler cache_licenca:', e);
    }
  }

  return {
    status: 'ativo',
    bloqueado: false,
    aviso_atraso: false,
    dias_atraso: 0,
    modo_offline: true,
  };
}

export function deveBloquearRequisicao(licenca, caminho = '') {
  if (!licenca || !licenca.bloqueado) return false;

  const rotasLiberadas = [
    '/licenca/status',
    '/licenca-status',
    '/admin/logout',
  ];

  for (const permitida of rotasLiberadas) {
    if (caminho === permitida || caminho.endsWith(permitida) || caminho.includes(permitida)) {
      return false;
    }
  }

  return true;
}

// Registra middleware de validação antes de cada requisição
definirMiddleware(async ({ env, db, caminho }) => {
  const lic = await consultarLicencaCentral({ env, db });
  if (deveBloquearRequisicao(lic, caminho)) {
    throw erro(402, 'licenca_bloqueada', lic.mensagem || 'Acesso temporariamente suspenso por pendência financeira.');
  }
});

// Rota para o frontend consultar status da licença
rota('GET', '/licenca/status', async ({ db, env }) => {
  const licenca = await consultarLicencaCentral({ db, env });
  return json(licenca);
});
