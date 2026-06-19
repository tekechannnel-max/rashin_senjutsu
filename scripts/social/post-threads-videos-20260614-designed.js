const approvedReels = require('./post-approved-reels');

function normalizeArgs(argv) {
  const args = argv.filter(arg => arg !== '--yes');
  const hasPlatforms = args.some(arg => arg === '--platforms' || arg.startsWith('--platforms='));
  if (!hasPlatforms) args.push('--platforms=threads');
  return args;
}

process.stderr.write(
  '[deprecated] scripts/social/post-threads-videos-20260614-designed.js now delegates to post-approved-reels.js. '
  + 'Only approved Threads reels in data/social-posts/approved-reels/*.json can be posted.\n'
);

approvedReels.run(approvedReels.parseArgs(normalizeArgs(process.argv.slice(2)))).then(report => {
  console.log(JSON.stringify(report, null, 2));
}).catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
