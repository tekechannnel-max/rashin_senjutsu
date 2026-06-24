#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const { birthdayMiniFamilyForDay } = require('./birthday-mini-family');

function main() {
  birthdayMiniFamilyForDay(1);
  const script = path.join(__dirname, 'generate-birthday-reels-20260620.js');
  const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
    cwd: path.resolve(__dirname, '..', '..'),
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

if (require.main === module) main();

module.exports = { birthdayMiniFamilyForDay };
