// functions/_lib/push.js
// Motor Web Push nativo para Cloudflare Workers e Node.js (RFC 8291 / RFC 8292)

const VAPID_SUBJECT_PADRAO = 'mailto:contato@jerusa-beauty.pages.dev';

export function bytesToBase64Url(bytes) {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBytes(str) {
  const base64 = str
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Garante que a tabela push_subscriptions existe no banco D1 / SQLite.
 */
export async function garantirTabelaPush(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        criado_em INTEGER NOT NULL,
        ultimo_sucesso INTEGER,
        falhas_consecutivas INTEGER NOT NULL DEFAULT 0
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subscriptions (endpoint)`).run();
  } catch (err) {
    console.warn('Aviso ao garantir tabela push_subscriptions:', err.message);
  }
}

/**
 * Recupera ou gera chaves VAPID (P-256) na tabela config.
 */
export async function obterOuCriarChavesVapid(db) {
  await garantirTabelaPush(db);

  const [pubRow, privRow, subRow] = await Promise.all([
    db.prepare('SELECT valor FROM config WHERE chave = ?1').bind('vapid_public_key').first('valor'),
    db.prepare('SELECT valor FROM config WHERE chave = ?1').bind('vapid_private_key').first('valor'),
    db.prepare('SELECT valor FROM config WHERE chave = ?1').bind('vapid_subject').first('valor'),
  ]);

  if (pubRow && privRow) {
    try {
      const privateKeyJwk = JSON.parse(privRow);
      return {
        publicKey: pubRow,
        privateKeyJwk,
        subject: subRow || VAPID_SUBJECT_PADRAO,
      };
    } catch {
      // Se falhou o parse do JSON da chave privada, gera um novo par abaixo
    }
  }

  // Gera novo par de chaves ECDSA P-256 para VAPID
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const rawPub = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const jwkPriv = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  const publicKey = bytesToBase64Url(new Uint8Array(rawPub));
  const privateKeyJson = JSON.stringify(jwkPriv);
  const subject = subRow || VAPID_SUBJECT_PADRAO;

  const upsert = db.prepare(
    'INSERT INTO config (chave, valor) VALUES (?1, ?2) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
  );

  await upsert.bind('vapid_public_key', publicKey).run();
  await upsert.bind('vapid_private_key', privateKeyJson).run();
  await upsert.bind('vapid_subject', subject).run();

  return {
    publicKey,
    privateKeyJwk: jwkPriv,
    subject,
  };
}
