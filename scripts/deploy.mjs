import { execSync } from 'node:child_process';

const accountId = '7fd07bf9fdec715ef4cb326c9094f2d1';
console.log('[Deploy] Fazendo deploy no Cloudflare Pages (jerusa-beauty)...');
execSync('node node_modules/wrangler/bin/wrangler.js pages deploy public --project-name=jerusa-beauty --commit-dirty=true', {
  stdio: 'inherit',
  env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
});
console.log('[Deploy] Deploy concluído com sucesso!');
