const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const {
  validateMiniCharactersForPost,
} = require('./birthday-mini-review');

const ROOT = path.resolve(__dirname, '..', '..');
const APPROVED_DIR = resolveConfiguredPath(
  'SOCIAL_APPROVED_REELS_DIR',
  path.join(ROOT, 'data', 'social-posts', 'approved-reels')
);
const DEFAULT_OUT_DIR = path.join(ROOT, 'output', 'social-visual-review');
const DEFAULT_USAGE_FILE = path.join(ROOT, 'data', 'social-posts', 'mini-character-usage.json');

function resolveConfiguredPath(envName, fallback) {
  const configured = String(process.env[envName] || '').trim();
  if (!configured) return fallback;
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
}

function parseArgs(argv) {
  const args = {
    date: '',
    manifest: '',
    outDir: DEFAULT_OUT_DIR,
    writeReview: false,
    writeUsage: false,
    usageFile: DEFAULT_USAGE_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--date') args.date = argv[++index] || '';
    else if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length);
    else if (arg === '--manifest') args.manifest = argv[++index] || '';
    else if (arg.startsWith('--manifest=')) args.manifest = arg.slice('--manifest='.length);
    else if (arg === '--out-dir') args.outDir = argv[++index] || args.outDir;
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length) || args.outDir;
    else if (arg === '--write-review') args.writeReview = true;
    else if (arg === '--write-usage') args.writeUsage = true;
    else if (arg === '--usage-file') args.usageFile = argv[++index] || args.usageFile;
    else if (arg.startsWith('--usage-file=')) args.usageFile = arg.slice('--usage-file='.length) || args.usageFile;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error(`Invalid --date: ${args.date}`);
  args.manifest = args.manifest ? resolveRootPath(args.manifest) : '';
  args.outDir = resolveRootPath(args.outDir);
  args.usageFile = resolveRootPath(args.usageFile);
  return args;
}

function resolveRootPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function walkJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.json$/i.test(entry.name)) files.push(full);
    }
  };
  walk(dir);
  return files.sort();
}

function manifestFiles(args) {
  if (args.manifest) return [args.manifest];
  return walkJsonFiles(APPROVED_DIR);
}

function fileUrl(filePath) {
  const absolute = resolveRootPath(filePath);
  return `file:///${absolute.replace(/\\/g, '/')}`;
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function verifyPost(file, manifest, post, index) {
  const errors = [];
  const review = post.designReview || post.review || {};
  const miniCharacters = Array.isArray(review.miniCharacters)
    ? review.miniCharacters
    : Array.isArray(post.miniCharacters)
      ? post.miniCharacters
      : [];
  errors.push(...validateMiniCharactersForPost(post, miniCharacters, `${rel(file)} posts[${index}]`));

  const videoPath = resolveRootPath(post.videoPath || '');
  if (!post.videoPath || !fs.existsSync(videoPath)) {
    errors.push(`${rel(file)} posts[${index}] videoPath does not exist: ${post.videoPath || ''}`);
  }

  const screenshots = Array.isArray(review.screenshots) ? review.screenshots : [];
  if (!screenshots.length) errors.push(`${rel(file)} posts[${index}] designReview.screenshots is required.`);
  for (const screenshot of screenshots) {
    const screenshotPath = resolveRootPath(screenshot);
    if (!fs.existsSync(screenshotPath)) errors.push(`${rel(file)} posts[${index}] screenshot does not exist: ${screenshot}`);
  }

  const visual = review.visualInspection || {};
  if (visual.status !== 'passed') errors.push(`${rel(file)} posts[${index}] visualInspection.status must be passed.`);
  const artifacts = Array.isArray(visual.reviewArtifacts) ? visual.reviewArtifacts : [];
  if (!artifacts.length) errors.push(`${rel(file)} posts[${index}] visualInspection.reviewArtifacts is required.`);
  if (!artifacts.some(artifact => /contact/i.test(String(artifact)))) {
    errors.push(`${rel(file)} posts[${index}] visualInspection.reviewArtifacts must include a contact sheet.`);
  }
  for (const artifact of artifacts) {
    const artifactPath = resolveRootPath(artifact);
    if (!fs.existsSync(artifactPath)) errors.push(`${rel(file)} posts[${index}] visual artifact does not exist: ${artifact}`);
  }

  const miniUsage = miniCharacters.map(entry => ({
    rank: entry.rank,
    day: entry.day,
    family: entry.family,
    asset: entry.asset,
    assetPath: entry.assetPath,
  }));
  return {
    ok: errors.length === 0,
    errors,
    sourceFile: rel(file),
    manifestApprovedAt: manifest.approvedAt || '',
    id: post.id,
    date: post.date,
    time: post.time,
    title: post.title,
    topicType: post.topicType || '',
    researchTarget: post.researchTarget || '',
    videoPath: post.videoPath || '',
    screenshots,
    visualInspection: visual,
    miniCharacters: miniUsage,
  };
}

function buildHtml(report) {
  const posts = report.posts.map(post => `
    <article class="${post.ok ? 'ok' : 'error'}">
      <h2>${htmlEscape(post.time)} ${htmlEscape(post.title)}</h2>
      <p><strong>ID</strong> ${htmlEscape(post.id)}</p>
      <p><strong>Topic</strong> ${htmlEscape(post.topicType || post.researchTarget)}</p>
      <video controls src="${htmlEscape(fileUrl(post.videoPath))}"></video>
      <section class="screens">
        ${post.visualInspection?.reviewArtifacts?.map(artifact => `
          <figure>
            <img src="${htmlEscape(fileUrl(artifact))}" alt="${htmlEscape(artifact)}">
            <figcaption>${htmlEscape(artifact)}</figcaption>
          </figure>
        `).join('') || ''}
      </section>
      <section class="mini">
        ${post.miniCharacters.map(entry => `
          <figure>
            <img src="${htmlEscape(fileUrl(entry.assetPath))}" alt="${htmlEscape(entry.asset)}">
            <figcaption>${htmlEscape(`#${entry.rank || ''} ${entry.day}日 -> ${entry.family}系 ${entry.assetPath}`)}</figcaption>
          </figure>
        `).join('')}
      </section>
      ${post.errors.length ? `<pre>${htmlEscape(post.errors.join('\n'))}</pre>` : ''}
    </article>
  `).join('\n');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>Rashin approved reels visual review</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #f6f7f8; color: #17202a; }
    header { padding: 24px 32px; background: #15212b; color: white; }
    main { padding: 24px 32px 56px; display: grid; gap: 24px; }
    article { background: white; border: 1px solid #d5dbe1; border-radius: 6px; padding: 20px; }
    article.error { border-color: #b42318; }
    h1, h2, p { margin: 0 0 12px; }
    video { width: min(360px, 100%); max-height: 640px; background: #111; display: block; margin: 12px 0 20px; }
    .screens, .mini { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
    figure { margin: 0; border: 1px solid #d8dde3; border-radius: 6px; overflow: hidden; background: #fbfcfd; }
    img { display: block; width: 100%; height: 260px; object-fit: contain; background: #eef1f4; }
    .mini img { height: 160px; }
    figcaption { padding: 8px 10px; font-size: 12px; line-height: 1.35; word-break: break-all; }
    pre { white-space: pre-wrap; color: #b42318; background: #fff4f2; padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>Rashin approved reels visual review</h1>
    <p>${htmlEscape(report.checkedAt)} / posts: ${report.posts.length} / ok: ${report.ok}</p>
  </header>
  <main>${posts}</main>
</body>
</html>
`;
}

async function writeReviewHtml(report, args) {
  const datePart = args.date || 'all';
  const outDir = path.join(args.outDir, datePart);
  const outFile = path.join(outDir, 'index.html');
  await fsp.mkdir(outDir, { recursive: true });
  await fsp.writeFile(outFile, buildHtml(report), 'utf8');
  return rel(outFile);
}

async function writeUsage(report, args) {
  const current = readJson(args.usageFile, { updatedAt: '', posts: [] });
  const postsById = new Map((current.posts || []).map(post => [post.id, post]));
  for (const post of report.posts) {
    postsById.set(post.id, {
      id: post.id,
      date: post.date,
      time: post.time,
      title: post.title,
      topicType: post.topicType,
      researchTarget: post.researchTarget,
      sourceFile: post.sourceFile,
      videoPath: post.videoPath,
      reviewArtifacts: post.visualInspection?.reviewArtifacts || [],
      miniCharacters: post.miniCharacters,
    });
  }
  const next = {
    updatedAt: new Date().toISOString(),
    posts: [...postsById.values()].sort((a, b) => `${a.date} ${a.time} ${a.id}`.localeCompare(`${b.date} ${b.time} ${b.id}`)),
  };
  await writeJson(args.usageFile, next);
  return rel(args.usageFile);
}

async function run(args = parseArgs(process.argv.slice(2))) {
  const posts = [];
  for (const file of manifestFiles(args)) {
    const manifest = readJson(file, null);
    if (!manifest || manifest.approvalStatus !== 'approved') continue;
    for (const [index, post] of (manifest.posts || []).entries()) {
      if (args.date && post.date !== args.date) continue;
      posts.push(verifyPost(file, manifest, post, index));
    }
  }
  const report = {
    ok: posts.every(post => post.ok),
    checkedAt: new Date().toISOString(),
    approvedDir: rel(APPROVED_DIR),
    date: args.date || '',
    posts,
  };
  if (args.writeReview) report.reviewHtml = await writeReviewHtml(report, args);
  if (args.writeUsage) report.usageFile = await writeUsage(report, args);
  return report;
}

if (require.main === module) {
  run().then(report => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  }).catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  run,
};
