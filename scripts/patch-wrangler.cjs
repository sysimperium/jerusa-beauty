const fs = require('fs');
const p = './node_modules/.bin/wrangler.cmd';
if (fs.existsSync(p)) {
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('SET dp0=%~dp0')) {
    c = c.replace('SET dp0=%~dp0', 'SET "dp0=%~dp0"');
    fs.writeFileSync(p, c);
  }
}
