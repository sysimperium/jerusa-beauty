import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Import handlers das rotas existentes
import { despachar } from './functions/_lib/router.js';
import './functions/_lib/licenca.js';
import './functions/_lib/rotas-publicas.js';
import './functions/_lib/rotas-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------------
// Emulação compatível com a API Cloudflare D1 sobre node:sqlite DatabaseSync
// ---------------------------------------------------------------------------
class D1PreparedStatement {
  constructor(dbSync, sql, bindings = []) {
    this._db = dbSync;
    this._sql = sql;
    this._bindings = bindings;
  }

  bind(...args) {
    return new D1PreparedStatement(this._db, this._sql, args);
  }

  async all() {
    const stmt = this._db.prepare(this._sql);
    const results = stmt.all(...this._bindings);
    return { results: results || [] };
  }

  async first(column) {
    const stmt = this._db.prepare(this._sql);
    const row = stmt.get(...this._bindings);
    if (!row) return null;
    if (column) return row[column] ?? null;
    return row;
  }

  async run() {
    const stmt = this._db.prepare(this._sql);
    const res = stmt.run(...this._bindings);
    return {
      success: true,
      meta: {
        changes: res.changes,
        last_row_id: Number(res.lastInsertRowid),
      },
    };
  }
}

class D1DatabaseSync {
  constructor(dbSync) {
    this._db = dbSync;
  }

  prepare(sql) {
    return new D1PreparedStatement(this._db, sql);
  }

  async batch(statements) {
    this._db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const s of statements) {
        const stmt = this._db.prepare(s._sql);
        if (s._sql.trim().toUpperCase().startsWith('SELECT')) {
          results.push({ results: stmt.all(...s._bindings) });
        } else {
          const res = stmt.run(...s._bindings);
          results.push({ success: true, meta: { changes: res.changes } });
        }
      }
      this._db.exec('COMMIT');
      return results;
    } catch (err) {
      this._db.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(sql) {
    return this._db.exec(sql);
  }
}

// ---------------------------------------------------------------------------
// Inicialização do Banco de Dados
// ---------------------------------------------------------------------------
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.join(dataDir, 'app.db');
const dbSync = new DatabaseSync(dbFilePath);
const d1 = new D1DatabaseSync(dbSync);

// Cria tabelas e insere dados padrão se banco estiver vazio
const tables = dbSync.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='config'").all();
if (!tables || tables.length === 0) {
  console.log('[SysImperium] Inicializando tabelas (schema.sql)...');
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    dbSync.exec(fs.readFileSync(schemaPath, 'utf8'));
  }
  const seedPath = path.join(__dirname, 'seed.sql');
  if (fs.existsSync(seedPath)) {
    console.log('[SysImperium] Aplicando seed inicial (seed.sql)...');
    dbSync.exec(fs.readFileSync(seedPath, 'utf8'));
  }
  console.log('[SysImperium] Banco de dados pronto.');
}

// ---------------------------------------------------------------------------
// Mapeamento e Entrega de Arquivos Estáticos
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(reqPath, res) {
  let cleanPath = decodeURIComponent(reqPath.split('?')[0]);
  if (cleanPath === '/' || cleanPath === '') cleanPath = '/index.html';
  if (cleanPath === '/admin' || cleanPath === '/admin/') cleanPath = '/admin/index.html';
  if (cleanPath === '/bio' || cleanPath === '/bio/') cleanPath = '/bio/index.html';
  if (cleanPath === '/links' || cleanPath === '/links/') cleanPath = '/links/index.html';

  let filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end('Acesso negado');
    return true;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', cleanPath.endsWith('.html') ? 'no-cache' : 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Servidor HTTP
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `${proto}://${host}`);

    // Healthcheck para Docker e SysImperium
    if (url.pathname === '/healthz') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', project: 'jerusa-beauty', time: new Date().toISOString() }));
      return;
    }

    // Rotas de API
    if (url.pathname.startsWith('/api')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = ['GET', 'HEAD', 'DELETE'].includes(req.method) ? undefined : Buffer.concat(chunks);

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
        else if (v) headers.set(k, v);
      }

      const webRequest = new Request(url.href, {
        method: req.method,
        headers,
        body,
        duplex: body ? 'half' : undefined,
      });

      const env = {
        DB: d1,
        APP_ID: process.env.APP_ID || 'jerusa-beauty',
        CHAVE_LICENCA: process.env.CHAVE_LICENCA || 'chave-jerusabeauty-imperium-2026',
        ROOT_URL: process.env.ROOT_URL || 'https://root-sysimperium.pages.dev',
        ZAP_SERVICE_URL: process.env.ZAP_SERVICE_URL || 'https://meustudio-zap.onrender.com',
        ZAP_API_KEY: process.env.ZAP_API_KEY || 'meustudio_zap_secret_2026',
      };

      const webResponse = await despachar({
        request: webRequest,
        env,
        waitUntil: (p) => Promise.resolve(p).catch((err) => console.error('Erro em background task:', err)),
      });

      res.statusCode = webResponse.status;

      if (typeof webResponse.headers.getSetCookie === 'function') {
        const cookies = webResponse.headers.getSetCookie();
        if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
      }

      webResponse.headers.forEach((val, key) => {
        if (key.toLowerCase() !== 'set-cookie') res.setHeader(key, val);
      });

      const buf = Buffer.from(await webResponse.arrayBuffer());
      res.end(buf);
      return;
    }

    // Arquivos estáticos da pasta public
    const served = serveStatic(url.pathname, res);
    if (!served) {
      if (url.pathname.startsWith('/admin')) {
        serveStatic('/admin/index.html', res);
      } else {
        serveStatic('/index.html', res);
      }
    }
  } catch (err) {
    console.error('[SysImperium Server Error]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ erro: 'erro_interno', mensagem: 'Erro interno no servidor.' }));
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[SysImperium] Jerusa Beauty rodando em http://${HOST}:${PORT}`);
});
