const path = require('node:path');
const { spawnSync } = require('node:child_process');

const APPROVED_REELS_SCRIPT = path.join(__dirname, 'post-approved-reels.js');

function parseArgs(argv) {
  const out = {
    post: false,
    dryRun: false,
    list: false,
    onlyId: '',
    platforms: '',
  };
  for (const arg of argv) {
    if (arg === '--post') out.post = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--list') out.list = true;
    else if (arg === '--yes') continue;
    else if (arg === '--verify-only') {
      out.list = true;
      out.dryRun = true;
    } else if (arg === '--force') {
      throw new Error('post-daily-birthday-reels.js is deprecated and does not support --force. Use approved manifests and due-window posting.');
    } else if (arg.startsWith('--ids=')) {
      const ids = arg.slice('--ids='.length).split(',').map(item => item.trim()).filter(Boolean);
      if (ids.length > 1) {
        throw new Error('Multiple --ids are not supported by the approved-manifest compatibility shim.');
      }
      out.onlyId = ids[0] || '';
    } else if (arg.startsWith('--only-id=')) {
      out.onlyId = arg.slice('--only-id='.length);
    } else if (arg.startsWith('--platforms=')) {
      out.platforms = arg.slice('--platforms='.length);
    } else {
      throw new Error(`Unknown argument for deprecated daily reel shim: ${arg}`);
    }
  }
  if (!out.post) out.dryRun = true;
  return out;
}

function buildApprovedArgs(args) {
  const next = [];
  if (args.post) next.push('--post');
  if (args.dryRun) next.push('--dry-run');
  if (args.list) next.push('--list');
  if (args.onlyId) next.push(`--only-id=${args.onlyId}`);
  if (args.platforms) next.push(`--platforms=${args.platforms}`);
  return next;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = spawnSync(process.execPath, [APPROVED_REELS_SCRIPT, ...buildApprovedArgs(args)], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exit(result.status || 0);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
