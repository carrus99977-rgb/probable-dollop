import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let failed = false;
for (const name of readdirSync(new URL('.', import.meta.url)).sort()) {
  if (name === 'run.mjs' || !/\.(mjs|ts)$/.test(name)) continue;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', `tests/${name}`], {
    stdio: 'inherit', env: { ...process.env, DOLGI_ALLOWED_EMAILS: 'test@example.invalid' },
  });
  if (run.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
