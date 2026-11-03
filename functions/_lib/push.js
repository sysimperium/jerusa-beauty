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

function concatBytes(...arrays) {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
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

/**
 * Gera o cabeçalho Authorization VAPID (RFC 8292).
 */
export async function gerarHeaderVapid(endpoint, vapid) {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h de validade

  const headerObj = { typ: 'JWT', alg: 'ES256' };
  const payloadObj = { aud, exp, sub: vapid.subject };

  const encoder = new TextEncoder();
  const headerB64 = bytesToBase64Url(encoder.encode(JSON.stringify(headerObj)));
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payloadObj)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const privKey = await crypto.subtle.importKey(
    'jwk',
    vapid.privateKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    encoder.encode(unsignedToken)
  );

  const sigB64 = bytesToBase64Url(new Uint8Array(signature));
  const jwt = `${unsignedToken}.${sigB64}`;

  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/**
 * Cifra a carga útil JSON no padrão RFC 8291 (aes128gcm).
 */
export async function cifrarPayloadPush(subscription, payloadJson) {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payloadJson));
  const clientPubBytes = base64UrlToBytes(subscription.p256dh);
  const clientAuthBytes = base64UrlToBytes(subscription.auth);

  // 1. Gera par de chaves ECDH efêmeras do remetente
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  // 2. Importa chave pública do cliente e deriva segredo compartilhado (ECDH)
  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ecdhSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey },
    localKeyPair.privateKey,
    256
  );

  // 3. HKDF Info para extrair IKM (RFC 8291 Section 3.2)
  // key_info = "WebPush: info\0" || client_public_key || server_public_key
  const webPushInfoLabel = encoder.encode('WebPush: info\0');
  const keyInfo = concatBytes(webPushInfoLabel, clientPubBytes, localPubRaw);

  const ecdhBaseKey = await crypto.subtle.importKey('raw', ecdhSecret, 'HKDF', false, ['deriveBits']);
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: clientAuthBytes, info: keyInfo },
    ecdhBaseKey,
    256
  );

  // 4. Gera salt aleatório de 16 bytes
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const ikmBaseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits', 'deriveKey']);

  // 5. Deriva CEK (Content Encryption Key) e NONCE
  const cek = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('Content-Encoding: aes128gcm\0') },
    ikmBaseKey,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt']
  );

  const nonceBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode('Content-Encoding: nonce\0') },
    ikmBaseKey,
    96
  );

  // 6. Prepara registro com delimitador de final (0x02)
  const record = concatBytes(plaintext, new Uint8Array([0x02]));

  // 7. Cifra com AES-GCM
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonceBits), tagLength: 128 },
    cek,
    record
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  // 8. Monta cabeçalho binário RFC 8291:
  // salt (16 bytes) || rs (4 bytes = 4096) || idlen (1 byte = 65) || keyid (65 bytes)
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]); // 4096 bytes
  const idlen = new Uint8Array([localPubRaw.length]);
  const header = concatBytes(salt, rs, idlen, localPubRaw);

  return concatBytes(header, ciphertext);
}

/**
 * Envia uma notificação Web Push para uma assinatura específica.
 */
export async function enviarPushParaAssinatura(db, subscription, payload, { fetchFn = fetch, vapid = null } = {}) {
  try {
    const vapidConfig = vapid || (await obterOuCriarChavesVapid(db));
    const authHeader = await gerarHeaderVapid(subscription.endpoint, vapidConfig);
    const bodyEncrypted = await cifrarPayloadPush(subscription, payload);

    const res = await fetchFn(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': 'high',
        'Authorization': authHeader,
      },
      body: bodyEncrypted,
    });

    if (res.ok || res.status === 201 || res.status === 202) {
      if (db && subscription.endpoint) {
        await db.prepare(
          'UPDATE push_subscriptions SET ultimo_sucesso = ?1, falhas_consecutivas = 0 WHERE endpoint = ?2'
        ).bind(Date.now(), subscription.endpoint).run().catch(() => {});
      }
      return true;
    }

    // Se o serviço push retornou 404 (Not Found) ou 410 (Gone), a inscrição foi revogada/expirada
    if (res.status === 404 || res.status === 410) {
      if (db && subscription.endpoint) {
        await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1')
          .bind(subscription.endpoint).run().catch(() => {});
      }
      return false;
    }

    // Outros erros incrementam falhas consecutivas
    if (db && subscription.endpoint) {
      await db.prepare(`
        UPDATE push_subscriptions
        SET falhas_consecutivas = falhas_consecutivas + 1
        WHERE endpoint = ?1
      `).bind(subscription.endpoint).run().catch(() => {});
    }

    return false;
  } catch (err) {
    console.warn(`[Push] Erro ao enviar para ${subscription.endpoint}:`, err.message);
    return false;
  }
}

/**
 * Dispara uma notificação para todos os dispositivos cadastrados.
 */
export async function dispararPushParaTodos(db, payload, { fetchFn = fetch } = {}) {
  await garantirTabelaPush(db);
  const { results: subscriptions = [] } = await db.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions'
  ).all();

  if (subscriptions.length === 0) {
    return { total: 0, enviados: 0, falhas: 0, removidos: 0 };
  }

  const vapid = await obterOuCriarChavesVapid(db);
  let enviados = 0;
  let falhas = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      const ok = await enviarPushParaAssinatura(db, sub, payload, { fetchFn, vapid });
      if (ok) enviados++;
      else falhas++;
    })
  );

  return { total: subscriptions.length, enviados, falhas };
}

/**
 * Notificação push de Novo Agendamento para o celular da profissional.
 */
export async function notificarPushNovoAgendamento(db, env, agendamentoInfo, options = {}) {
  try {
    const { cliente_nome, data, inicio_min, local, servicos, preco, token } = agendamentoInfo;
    const [ano, mes, dia] = data.split('-');
    const dataFmt = `${dia}/${mes}/${ano}`;
    const horaFmt = `${String(Math.floor(inicio_min / 60)).padStart(2, '0')}:${String(inicio_min % 60).padStart(2, '0')}`;
    const servicosTexto = servicos && servicos.length > 0 ? servicos.map((s) => s.nome).join(', ') : 'Atendimento';
    const localTexto = local === 'espaco' ? 'No espaço' : 'A domicílio';
    const valorReais = preco ? (preco / 100).toFixed(2).replace('.', ',') : '0,00';

    const payload = {
      title: '💅 Novo Agendamento Recebido!',
      body: `👤 ${cliente_nome} agendou ${servicosTexto}\n📅 ${dataFmt} às ${horaFmt} (${localTexto})\n💰 R$ ${valorReais}`,
      icon: '/img/icon-192.png',
      tag: `agendamento-${token || Date.now()}`,
      data: { url: `/admin/?data=${data}` },
    };

    return await dispararPushParaTodos(db, payload, options);
  } catch (err) {
    console.error('Falha ao notificar push de novo agendamento:', err);
    return null;
  }
}

/**
 * Notificação push de Cancelamento para o celular da profissional.
 */
export async function notificarPushCancelamento(db, env, agendamentoInfo, options = {}) {
  try {
    const { cliente_nome, data, inicio_min } = agendamentoInfo;
    const [ano, mes, dia] = data.split('-');
    const dataFmt = `${dia}/${mes}/${ano}`;
    const horaFmt = `${String(Math.floor(inicio_min / 60)).padStart(2, '0')}:${String(inicio_min % 60).padStart(2, '0')}`;

    const payload = {
      title: '⚠️ Horário Cancelado',
      body: `${cliente_nome} desmarcou o atendimento de ${dataFmt} às ${horaFmt}.\nEsse horário já foi liberado na sua agenda para novas vagas.`,
      icon: '/img/icon-192.png',
      tag: `cancelamento-${Date.now()}`,
      data: { url: `/admin/?data=${data}` },
    };

    return await dispararPushParaTodos(db, payload, options);
  } catch (err) {
    console.error('Falha ao notificar push de cancelamento:', err);
    return null;
  }
}
