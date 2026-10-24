import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isManagedBackupFilename } from '../scripts/backupFileNaming.js';

test('regular cleanup targets only Beacon snapshots and historical DiddyBot filenames',()=>{
  assert.equal(isManagedBackupFilename('beacon-backup-20261025-123456.dump'),true);
  assert.equal(isManagedBackupFilename('diddybot9000-backup-20250101-000000.dump'),true);
  assert.equal(isManagedBackupFilename('restore-drill-20261025-123456.dump'),false);
  for(const name of ['manual.dump','customer-data.dump','random-backup-20261025-123456.dump',
    '../beacon-backup-20261025-123456.dump','beacon-backup-20261025-123456.dump.old',
    'beacon-backup-invalid.dump','DB.DUMP']){
    assert.equal(isManagedBackupFilename(name),false,name);
  }
});

test('restore drill cleanup only targets its own snapshots',()=>{
  assert.equal(isManagedBackupFilename('restore-drill-20261025-123456.dump','drill'),true);
  assert.equal(isManagedBackupFilename('beacon-backup-20261025-123456.dump','drill'),false);
  assert.equal(isManagedBackupFilename('manual.dump','drill'),false);
});

test('backup and restore-drill jobs use the backup cleanup allowlist',async()=>{
  const backup=await readFile('scripts/backup.js','utf8');
  const drill=await readFile('scripts/restore-drill.js','utf8');
  assert.match(backup,/isManagedBackupFilename\(entry\.name, 'regular'\)/);
  assert.match(drill,/isManagedBackupFilename\(entry\.name, 'drill'\)/);
  assert.match(backup,/beacon-backup-\$\{createTimestamp\(\)\}/);
});
