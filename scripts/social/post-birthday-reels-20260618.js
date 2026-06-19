const approvedReels = require('./post-approved-reels');

process.stderr.write(
  '[deprecated] scripts/social/post-birthday-reels-20260618.js now delegates to post-approved-reels.js. '
  + 'Only data/social-posts/approved-reels/*.json can be posted.\n'
);

approvedReels.run(approvedReels.parseArgs(process.argv.slice(2))).then(report => {
  console.log(JSON.stringify(report, null, 2));
}).catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
