const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function pathExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walk(dir, predicate = () => true) {
  if (!pathExists(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function rel(filePath) {
  if (!path.isAbsolute(filePath)) return filePath.replace(/\\/g, '/');
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function parseJson(filePath) {
  try {
    return JSON.parse(readText(filePath));
  } catch (error) {
    return { __parseError: error.message };
  }
}

const violations = [];
const violationKeys = new Set();
const warnings = [];
const warningKeys = new Set();

function addViolation(code, filePath, message, detail = {}) {
  const item = {
    code,
    file: rel(filePath),
    message,
    ...detail,
  };
  const key = JSON.stringify(item);
  if (violationKeys.has(key)) return;
  violationKeys.add(key);
  violations.push(item);
}

function addWarning(code, filePath, message, detail = {}) {
  const item = {
    code,
    file: rel(filePath),
    message,
    ...detail,
  };
  const key = JSON.stringify(item);
  if (warningKeys.has(key)) return;
  warningKeys.add(key);
  warnings.push(item);
}

const workflowDir = path.join(ROOT, '.github', 'workflows');
const workflowFiles = walk(workflowDir, file => /\.(ya?ml)$/i.test(file));
const socialScriptFiles = walk(path.join(ROOT, 'scripts', 'social'), file => /\.js$/i.test(file));
const postingScriptFiles = socialScriptFiles.filter(file => {
  const base = path.basename(file);
  return /^post-/.test(base) || base === 'run-scheduled-posts.js';
});
let remoteScanError = null;

function readGitFile(ref, filePath) {
  const result = spawnSync('git', ['show', `${ref}:${filePath}`], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    remoteScanError = result.error.message;
    return null;
  }
  if (result.status !== 0) return null;
  return result.stdout;
}

function scanWorkflowText(file, text) {
  if (/--post\s+--force/.test(text)) {
    addViolation(
      'NO_POST_FORCE_IN_WORKFLOW',
      file,
      'Workflows must not publish with --post --force. Use an approved manifest and break-glass approval instead.'
    );
  }
  if (/\[post-\d{8}/.test(text) || /\bPOST_\d{8}/.test(text)) {
    addViolation(
      'NO_COMMIT_MESSAGE_POST_TRIGGER',
      file,
      'Commit-message or POST_YYYYMMDD triggers must not cause real posting.'
    );
  }
  if (/head_commit\.message/.test(text) && /post/i.test(text)) {
    addViolation(
      'NO_PUSH_MESSAGE_POSTING',
      file,
      'Push commit messages must not control publishing.'
    );
  }
}

function scanSocialScriptText(file, text) {
  const base = path.basename(file.replace(/^origin\/main:/, ''));
  if (/^generate-/.test(base) && /require\(['"].\/(?:instagram|threads)-client['"]\)/.test(text)) {
    addViolation(
      'GENERATOR_IMPORTS_PLATFORM_CLIENT',
      file,
      'Generation and research scripts must not import posting clients.'
    );
  }
  if (/^post-/.test(base) && /const\s+(?:REELS|THREADS_VIDEOS|VIDEOS)\s*=\s*\[/.test(text)) {
    addViolation(
      'POST_SCRIPT_HARDCODES_REELS',
      file,
      'Posting scripts must read approved manifests instead of hardcoded dated reel arrays.'
    );
  }
  if ((/^post-/.test(base) || base === 'run-scheduled-posts.js') && /draft_for_user_review|postingAction\s*:\s*['"]none['"]/.test(text)) {
    addViolation(
      'PUBLISHER_REFERENCES_DRAFT_MARKER',
      file,
      'Publishers must not reference draft markers or postingAction none assets.'
    );
  }
}

for (const file of workflowFiles) {
  scanWorkflowText(file, readText(file));
}

for (const file of socialScriptFiles) {
  scanSocialScriptText(file, readText(file));
}

const remotePathsToScan = [
  '.github/workflows/instagram-reels-backup.yml',
  '.github/workflows/threads-social.yml',
  '.github/workflows/sns-automation.yml',
  'scripts/social/post-daily-birthday-reels.js',
  'scripts/social/post-birthday-reels-20260618.js',
  'scripts/social/run-scheduled-posts.js',
];

for (const remotePath of remotePathsToScan) {
  const text = readGitFile('origin/main', remotePath);
  if (!text) continue;
  const label = `origin/main:${remotePath}`;
  if (/^\.github\/workflows\//.test(remotePath)) scanWorkflowText(label, text);
  if (/^scripts\/social\//.test(remotePath)) scanSocialScriptText(label, text);
}

if (remoteScanError) {
  addWarning(
    'REMOTE_MAIN_SCAN_UNAVAILABLE',
    'origin/main',
    'Could not inspect origin/main from this runtime. Do not claim the cloud pipeline is safe until the remote ref is scanned.',
    { error: remoteScanError }
  );
}

const manifestFiles = walk(path.join(ROOT, 'videos', 'social', 'instagram'), file => path.basename(file) === 'manifest.json');
const postableTexts = postingScriptFiles.concat(workflowFiles).map(file => ({
  file,
  text: readText(file),
}));

for (const manifestFile of manifestFiles) {
  const manifest = parseJson(manifestFile);
  if (manifest.__parseError) {
    addViolation('INVALID_REEL_MANIFEST_JSON', manifestFile, manifest.__parseError);
    continue;
  }
  const isDraft = String(manifest.status || '').includes('draft') || manifest.postingAction === 'none' || manifest.approvalStatus === 'draft';
  if (!isDraft) continue;

  const candidates = new Set();
  for (const post of manifest.posts || manifest.items || []) {
    for (const key of ['slug', 'title', 'videoPath', 'video', 'videoFile']) {
      if (post[key]) candidates.add(String(post[key]));
    }
    if (post.videoPath) candidates.add(path.basename(String(post.videoPath)));
    if (post.video) candidates.add(path.basename(String(post.video)));
    if (post.videoFile) candidates.add(path.basename(String(post.videoFile)));
  }

  for (const { file, text } of postableTexts) {
    for (const candidate of candidates) {
      if (!candidate || candidate.length < 8) continue;
      const normalized = candidate.replace(/\\/g, '/');
      const basename = path.basename(normalized);
      if (text.includes(normalized) || text.includes(basename)) {
        addViolation(
          'DRAFT_REEL_REFERENCED_BY_POSTING_PATH',
          file,
          'A draft reel manifest asset is referenced by a posting path.',
          {
            manifest: rel(manifestFile),
            candidate: basename,
          }
        );
      }
    }
  }
}

const approvedManifestFiles = walk(path.join(ROOT, 'data', 'social-posts', 'approved-reels'), file => /\.json$/i.test(file));
for (const file of approvedManifestFiles) {
  const manifest = parseJson(file);
  if (manifest.__parseError) {
    addViolation('INVALID_APPROVED_MANIFEST_JSON', file, manifest.__parseError);
    continue;
  }
  if (manifest.approvalStatus !== 'approved') {
    addViolation('APPROVED_MANIFEST_NOT_APPROVED', file, 'Approved manifest files must set approvalStatus=approved.');
  }
  for (const key of ['approvedBy', 'approvedAt', 'approvalText', 'approvalScope']) {
    if (!manifest[key]) addViolation('APPROVED_MANIFEST_MISSING_FIELD', file, `Approved manifest is missing ${key}.`);
  }
  if (!Array.isArray(manifest.posts) || manifest.posts.length === 0) {
    addViolation('APPROVED_MANIFEST_NO_POSTS', file, 'Approved manifest must include at least one post.');
  }
  for (const [index, post] of (manifest.posts || []).entries()) {
    for (const key of ['id', 'date', 'time', 'videoPath']) {
      if (!post[key]) {
        addViolation('APPROVED_POST_MISSING_FIELD', file, `posts[${index}] is missing ${key}.`);
      }
    }
    if (!post.captions?.instagram || !post.captions?.threads) {
      addViolation('APPROVED_POST_MISSING_CAPTIONS', file, `posts[${index}] must include captions.instagram and captions.threads.`);
    }
    const designReview = post.designReview || post.review || {};
    const checks = designReview.checks || {};
    for (const key of ['safeArea', 'readability', 'noTextPatternOverlap', 'saveCue', 'minicharaByNumber']) {
      if (checks[key] !== true) {
        addViolation('APPROVED_POST_MISSING_DESIGN_CHECK', file, `posts[${index}] must set designReview.checks.${key}=true.`);
      }
    }
    if (!Array.isArray(designReview.screenshots) || designReview.screenshots.length === 0) {
      addViolation('APPROVED_POST_MISSING_SCREENSHOT_PROOF', file, `posts[${index}] must include designReview.screenshots.`);
    }
  }
}

const report = {
  ok: violations.length === 0,
  checkedAt: new Date().toISOString(),
  violationCount: violations.length,
  warningCount: warnings.length,
  violations,
  warnings,
};

const output = JSON.stringify(report, null, 2);
if (violations.length) {
  console.error(output);
  process.exit(1);
}

console.log(output);
