import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Bound concurrency prevents large repositories from exhausting process handles.
const roots = [path.resolve('src'), path.resolve('scripts')];
const files = [path.resolve('index.js')];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}

function check(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => resolve({ file, code: 1, stderr: error.message }));
    child.once('close', code => resolve({ file, code, stderr }));
  });
}

for (const root of roots) await collect(root);
files.sort();
const results = new Array(files.length);
let nextIndex = 0;

async function worker() {
  while (nextIndex < files.length) {
    const index = nextIndex++;
    results[index] = await check(files[index]);
  }
}

await Promise.all(Array.from({ length: Math.min(6, files.length) }, () => worker()));

const failures = results.filter(result => result.code !== 0);
console.log(`Beacon syntax check: ${results.length - failures.length}/${results.length} JavaScript files passed.`);

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n--- ${failure.file} ---\n${failure.stderr.trim()}`);
  }
  process.exitCode = 1;
} else {
  console.log('No JavaScript syntax errors were found.');
}
