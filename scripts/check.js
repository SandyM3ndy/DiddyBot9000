import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('src');
const files = [];

async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(full);
    else if (entry.isFile() && full.endsWith('.js')) files.push(full);
  }
}

function check(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ file, code, stderr }));
  });
}

await collect(root);
files.sort();
const results = await Promise.all(files.map(check));
const failures = results.filter(result => result.code !== 0);

console.log(`Beacon code check: ${results.length - failures.length}/${results.length} JavaScript files passed.`);

if (failures.length) {
  console.error('\nSyntax errors found:\n');
  for (const failure of failures) {
    console.error(`--- ${failure.file} ---\n${failure.stderr.trim()}\n`);
  }
  process.exit(1);
}

console.log('No JavaScript syntax errors were found.');
