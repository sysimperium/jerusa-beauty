import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const projectDir = path.resolve(import.meta.dirname, '..');
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '7fd07bf9fdec715ef4cb326c9094f2d1';
const token = process.env.CLOUDFLARE_API_TOKEN || (() => {
  try {
    const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf8');
    const m = env.match(/CLOUDFLARE_API_TOKEN=(.+)/);
    return m ? m[1].trim() : '';
  } catch { return ''; }
})();

// Limpa cache compartilhado do wrangler para evitar colisão entre contas/projetos
const cacheDir = path.join(projectDir, 'node_modules', '.cache', 'wrangler');
try {
  fs.rmSync(cacheDir, { recursive: true, force: true });
} catch {}

console.log('[Deploy] Fazendo deploy no Cloudflare Pages (jerusa-beauty)...');
execSync('node node_modules/wrangler/bin/wrangler.js pages deploy public --project-name=jerusa-beauty --commit-dirty=true --branch=main', {
  cwd: projectDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: token,
  },
});
console.log('[Deploy] Deploy concluído com sucesso!');
