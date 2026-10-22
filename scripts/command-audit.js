import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../src/commands');
const knownLegacyDuplicates = new Set();
const seen = new Map();
const duplicateWarnings = [];
const errors = [];
let filesChecked = 0;

for (const folder of await readdir(root, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  const directory = path.join(root, folder.name);
  for (const file of await readdir(directory, { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.js')) continue;
    let source = await readFile(path.join(directory, file.name), 'utf8');
    // Some command entrypoints re-export a command from a module file.
    const reexport = source.match(/export\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+)['"]/);
    if (reexport) {
      source = await readFile(path.resolve(directory, reexport[1]), 'utf8');
    }
    const pathLabel = `${folder.name}/${file.name}`;
    filesChecked++;
    // Every top-level slash command declares its name via the first .setName call.
    const name = source.match(/\.setName\(\s*['"\x60]([a-z][\w-]*)['"\x60]\s*\)/)?.[1];
    if (!name) {
      errors.push(`No literal slash command name detected in ${pathLabel}`);
      continue;
    }
    if (['fight', 'hexcolor', 'avatar'].includes(name)) errors.push(`Removed command /${name} was reintroduced.`);
    if (seen.has(name)) {
      const message = `/${name}: ${seen.get(name)} and ${pathLabel}`;
      if (knownLegacyDuplicates.has(name)) duplicateWarnings.push(message);
      else errors.push(`Unexpected duplicate command ${message}`);
    } else {
      seen.set(name, pathLabel);
    }
  }
}

console.log(`Beacon command audit: ${filesChecked} files; ${seen.size} unique command names.`);
for (const message of duplicateWarnings) console.warn(`OWNER DECISION REQUIRED: ${message}`);
if (seen.size > 100) errors.push(`Command count ${seen.size} exceeds Discord global slash command limit.`);
if (errors.length) {
  for (const error of errors) console.error(`Command audit failed: ${error}`);
  process.exitCode = 1;
} else {
  console.log('No new duplicate slash commands or removed /fight command detected.');
}
