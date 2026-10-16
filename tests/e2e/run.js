// Runs every *.test.js in this folder, one after the other (each in its own process, with a fresh fake server).
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let bad = 0;
for (const f of files) { const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' }); if (r.status !== 0) bad++; }
console.log(bad ? `${bad} of ${files.length} browser test files failed` : `all ${files.length} browser test files passed`);
process.exit(bad ? 1 : 0);
