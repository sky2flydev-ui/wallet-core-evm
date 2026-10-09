import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', env: process.env });
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (process.env.NPM_PUBLISH_CONFIRM !== '1')
  throw new Error('Refusing to publish. Set NPM_PUBLISH_CONFIRM=1 after reviewing the package.');
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (branch !== 'main')
  throw new Error(`Refusing to publish from branch ${branch || '(detached)'}. Use main.`);
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
  throw new Error('Refusing to publish with a dirty Git tree.');
run('pnpm', ['run', 'release:check']);
run('npm', ['pack', '--dry-run']);
console.log(`Publishing ${packageJson.name}@${packageJson.version} as a public package.`);
run('npm', ['publish', '--access', 'public', '--provenance']);
