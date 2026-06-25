const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const instagram = require('./instagram-client');
const threads = require('./threads-client');
const {
  birthdayMiniAssetNameForDay,
  birthdayMiniFamilyForDay,
} = require('./birthday-mini-family');

const ROOT = path.resolve(__dirname, '..', '..');
function resolveConfiguredPath(envName, fallback) {
  const configured = String(process.env[envName] || '').trim();
  if (!configured) return fallback;
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
}

const APPROVED_DIR = resolveConfiguredPath('SOCIAL_APPROVED_REELS_DIR', path.join(ROOT, 'data', 'social-posts', 'approved-reels'));
const STATE_FILE = resolveConfiguredPath('SOCIAL_APPROVED_REELS_STATE_FILE', path.join(ROOT, 'data', 'social-posts', 'approved-reels-state.json'));
const RESULT_FILE = resolveConfiguredPath('SOCIAL_APPROVED_REELS_RESULTS_FILE', path.join(ROOT, 'data', 'social-posts', 'approved-reels-results.json'));
const DEFAULT_PLATFORMS = 'threads,instagram';
const DEFAULT_GRACE_MINUTES = 59;
const REQUIRED_THREADS_CTA = process.env.THREADS_FREE_READING_CTA || '無料占いはプロフィールURLから👀✨';
const REQUIRED_SAVE_CUE = process.env.SOCIAL_REQUIRED_SAVE_CUE || '保存していつでも思い出してください';

function parseArgs(argv) {
  const args = {
    post: false,
    dryRun: false,
    once: false,
    onlyId: '',
    platforms: '',
    force: false,
    skipDuplicateCheck: false,
    skipUrlCheck: false,
    list: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--post') args.post = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--once') args.once = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--skip-duplicate-check') args.skipDuplicateCheck = true;
    else if (arg === '--skip-url-check') args.skipUrlCheck = true;
    else if (arg === '--only-id') args.onlyId = argv[++index] || '';
    else if (arg.startsWith('--only-id=')) args.onlyId = arg.slice('--only-id='.length);
    else if (arg === '--platforms') args.platforms = argv[++index] || '';
    else if (arg.startsWith('--platforms=')) args.platforms = arg.slice('--platforms='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.post) args.dryRun = true;
  return args;
}

function splitCsv(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase();
  if (!['threads', 'instagram'].includes(platform)) throw new Error(`Unsupported platform: ${value}`);
  return platform;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonSync(file) {
  return JSON.parse(fsSync.readFileSync(file, 'utf8'));
}

function walkJsonFiles(dir) {
  if (!fsSync.existsSync(dir)) return [];
  const out = [];
  for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsonFiles(full));
    else if (/\.json$/i.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function getNow() {
  const override = String(process.env.SOCIAL_NOW_ISO || '').trim();
  if (!override) return new Date();
  const date = new Date(override);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SOCIAL_NOW_ISO: ${override}`);
  return date;
}

function getJstParts(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
}

function getJstDateKey(date = new Date()) {
  const parts = getJstParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getJstMinutes(date = new Date()) {
  const parts = getJstParts(date);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseTimeToMinutes(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid schedule time: ${raw}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute > 59) throw new Error(`Invalid schedule time: ${raw}`);
  return hour * 60 + minute;
}

function getGraceMinutes() {
  const raw = String(process.env.SOCIAL_POST_GRACE_MINUTES || DEFAULT_GRACE_MINUTES).trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid SOCIAL_POST_GRACE_MINUTES: ${raw}`);
  return value;
}

function resolvePathFromRoot(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return path.isAbsolute(raw) ? raw : path.resolve(ROOT, raw);
}

function publicUrlFromPath(filePath) {
  const origin = String(process.env.PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  if (!origin) throw new Error('PUBLIC_ORIGIN is required when approved reels use videoPath without videoUrl.');
  const absolute = resolvePathFromRoot(filePath);
  const relative = rel(absolute).split('/').map(part => encodeURIComponent(part)).join('/');
  return `${origin}/${relative}`;
}

function countHashtags(text) {
  return (String(text || '').match(/#[^\s#]+/g) || []).length;
}

function normalizeBirthDay(value, label) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${label} must be an integer from 1 to 31: ${value}`);
  }
  return day;
}

function ensureMiniCharacterReview(post, label, review) {
  if ((post.kind || 'birthday_reel') !== 'birthday_reel') return;
  const entries = Array.isArray(review.miniCharacters)
    ? review.miniCharacters
    : Array.isArray(post.miniCharacters)
      ? post.miniCharacters
      : [];
  if (!entries.length) {
    throw new Error(`${label} designReview.miniCharacters must list rank, day, family, and asset for every mini character.`);
  }
  const seenDays = new Set();
  for (const [index, entry] of entries.entries()) {
    const entryLabel = `${label} designReview.miniCharacters[${index}]`;
    const day = normalizeBirthDay(entry?.day, `${entryLabel}.day`);
    if (seenDays.has(day)) throw new Error(`${entryLabel}.day duplicates ${day}.`);
    seenDays.add(day);
    const expectedFamily = birthdayMiniFamilyForDay(day);
    const expectedAsset = birthdayMiniAssetNameForDay(day);
    if (Number(entry.family) !== expectedFamily) {
      throw new Error(`${entryLabel}.family must be ${expectedFamily} for ${day}日生まれ.`);
    }
    if (String(entry.asset || '').trim() !== expectedAsset) {
      throw new Error(`${entryLabel}.asset must be ${expectedAsset} for ${day}日生まれ.`);
    }
  }
}

function ensureDesignReview(post, label) {
  const review = post.designReview || post.review || {};
  const checks = review.checks || {};
  const requiredChecks = [
    'safeArea',
    'readability',
    'noTextPatternOverlap',
    'saveCue',
    'minicharaByNumber',
  ];
  for (const key of requiredChecks) {
    if (checks[key] !== true) {
      throw new Error(`${label} designReview.checks.${key} must be true before posting.`);
    }
  }
  if (!Array.isArray(review.screenshots) || review.screenshots.length === 0) {
    throw new Error(`${label} designReview.screenshots must include visual proof paths.`);
  }
  for (const screenshot of review.screenshots) {
    const value = String(screenshot || '').trim();
    if (!value) throw new Error(`${label} designReview.screenshots must not contain empty paths.`);
    if (/^https?:\/\//i.test(value)) continue;
    const proofPath = resolvePathFromRoot(value);
    if (!fsSync.existsSync(proofPath)) {
      throw new Error(`${label} designReview screenshot does not exist: ${rel(proofPath)}`);
    }
  }
  const saveCueText = String(review.saveCueText || post.saveCueText || '').trim();
  if (!saveCueText.includes(REQUIRED_SAVE_CUE)) {
    throw new Error(`${label} must include the save cue "${REQUIRED_SAVE_CUE}" in designReview.saveCueText.`);
  }
  ensureMiniCharacterReview(post, label, review);
}

function ensureApprovedManifest(manifest, file) {
  if (!manifest || typeof manifest !== 'object') throw new Error(`${rel(file)} is not a JSON object.`);
  if (manifest.approvalStatus !== 'approved') throw new Error(`${rel(file)} approvalStatus must be "approved".`);
  for (const key of ['approvedBy', 'approvedAt', 'approvalText', 'approvalScope']) {
    if (!manifest[key]) throw new Error(`${rel(file)} is missing ${key}.`);
  }
  if (!Array.isArray(manifest.posts) || manifest.posts.length === 0) {
    throw new Error(`${rel(file)} must include posts.`);
  }
}

function normalizePost(manifest, post, index, file) {
  const label = `${rel(file)} posts[${index}]`;
  for (const key of ['id', 'date', 'time', 'title', 'videoPath']) {
    if (!post[key]) throw new Error(`${label} is missing ${key}.`);
  }
  const videoPath = resolvePathFromRoot(post.videoPath);
  if (!fsSync.existsSync(videoPath)) throw new Error(`${label} videoPath does not exist: ${rel(videoPath)}`);
  const captions = post.captions || {};
  const instagramCaption = instagram.ensureInstagramCaption(captions.instagram);
  const threadsCaption = threads.ensureThreadsText(captions.threads);
  if (!threadsCaption.startsWith(REQUIRED_THREADS_CTA)) {
    throw new Error(`${label} Threads caption must start with "${REQUIRED_THREADS_CTA}".`);
  }
  if (countHashtags(threadsCaption) !== 1) {
    throw new Error(`${label} Threads caption must contain exactly one hashtag.`);
  }
  ensureDesignReview(post, label);
  const platforms = splitCsv(post.platforms || manifest.approvalScope || DEFAULT_PLATFORMS).map(normalizePlatform);
  if (!platforms.length) throw new Error(`${label} has no platforms.`);
  const videoUrl = String(post.videoUrl || post.publicVideoUrl || '').trim() || publicUrlFromPath(videoPath);
  instagram.ensurePublicVideoUrl(videoUrl);
  threads.ensurePublicMediaUrl(videoUrl);
  return {
    ...post,
    kind: post.kind || 'birthday_reel',
    sourceFile: file,
    videoPath,
    videoUrl,
    platforms: [...new Set(platforms)],
    captions: {
      instagram: instagramCaption,
      threads: threadsCaption,
    },
    minute: parseTimeToMinutes(post.time),
    approval: {
      approvedBy: manifest.approvedBy,
      approvedAt: manifest.approvedAt,
      approvalText: manifest.approvalText,
      approvalScope: manifest.approvalScope,
    },
  };
}

function loadApprovedPosts() {
  const posts = [];
  for (const file of walkJsonFiles(APPROVED_DIR)) {
    const manifest = readJsonSync(file);
    ensureApprovedManifest(manifest, file);
    manifest.posts.forEach((post, index) => posts.push(normalizePost(manifest, post, index, file)));
  }
  const seen = new Set();
  for (const post of posts) {
    if (seen.has(post.id)) throw new Error(`Duplicate approved reel id: ${post.id}`);
    seen.add(post.id);
  }
  return posts.sort((a, b) => `${a.date} ${a.time} ${a.id}`.localeCompare(`${b.date} ${b.time} ${b.id}`));
}

function isDue(post, now = getNow()) {
  const dateKey = getJstDateKey(now);
  if (post.date !== dateKey) return false;
  const lateBy = getJstMinutes(now) - post.minute;
  return lateBy >= 0 && lateBy <= getGraceMinutes();
}

function getRequestedPlatforms(args, post) {
  const requested = splitCsv(args.platforms || process.env.SOCIAL_PLATFORMS || '').map(normalizePlatform);
  if (!requested.length) return post.platforms;
  const allowed = new Set(post.platforms);
  return requested.filter(platform => allowed.has(platform));
}

function stateKey(post, platform) {
  return `${post.date}:${post.id}:${platform}`;
}

function requirePostingEnabled(args) {
  if (!args.post || args.dryRun) return;
  if (process.env.SOCIAL_AUTOMATED_POSTING_ENABLED !== 'true') {
    throw new Error('Set SOCIAL_AUTOMATED_POSTING_ENABLED=true before real approved reel posting.');
  }
  if (args.force) {
    if (process.env.SOCIAL_BREAK_GLASS !== 'true' || !process.env.BREAK_GLASS_APPROVAL_ID) {
      throw new Error('Break-glass posting requires SOCIAL_BREAK_GLASS=true and BREAK_GLASS_APPROVAL_ID.');
    }
  }
}

function dedupeNeedles(post, platform) {
  const text = post.captions[platform] || '';
  return [
    post.dedupeKey,
    post.title,
    post.id,
    text.slice(0, 80),
  ].map(value => String(value || '').trim()).filter(value => [...value].length >= 8);
}

function hasAnyNeedle(text, needles) {
  const haystack = String(text || '');
  return needles.some(needle => haystack.includes(needle));
}

async function findExistingInstagramPost(post) {
  const media = await instagram.listInstagramMedia({ limit: Number(process.env.SOCIAL_DUPLICATE_SCAN_LIMIT || 50) });
  const needles = dedupeNeedles(post, 'instagram');
  return (media.data || []).find(item => hasAnyNeedle(item.caption, needles)) || null;
}

async function findExistingThreadsPost(post) {
  const feed = await threads.listThreads({ limit: Number(process.env.SOCIAL_DUPLICATE_SCAN_LIMIT || 50) });
  const needles = dedupeNeedles(post, 'threads');
  return (feed.data || []).find(item => hasAnyNeedle(item.text, needles)) || null;
}

async function maybeCheckPublicUrl(post, args) {
  if (args.skipUrlCheck || args.dryRun) return null;
  const response = await fetch(post.videoUrl, {
    method: 'HEAD',
    signal: AbortSignal.timeout(Number(process.env.SOCIAL_URL_CHECK_TIMEOUT_MS || 15000)),
  });
  if (!response.ok) {
    throw new Error(`Public video URL check failed for ${post.id}: ${response.status} ${post.videoUrl}`);
  }
  return { status: response.status };
}

async function postToPlatform(post, platform, args, state, results) {
  const key = stateKey(post, platform);
  if (state[key]) {
    return { platform, status: 'skipped_state', state: state[key] };
  }
  if (!args.force && !isDue(post)) {
    return { platform, status: 'skipped_not_due', date: post.date, time: post.time };
  }
  if (!args.skipDuplicateCheck && !args.dryRun) {
    const existing = platform === 'instagram'
      ? await findExistingInstagramPost(post)
      : await findExistingThreadsPost(post);
    if (existing) {
      state[key] = {
        status: 'duplicate_found',
        at: new Date().toISOString(),
        permalink: existing.permalink || null,
        id: existing.id || null,
      };
      await writeJson(STATE_FILE, state);
      return { platform, status: 'skipped_duplicate', existing: state[key] };
    }
  }
  if (args.dryRun) {
    return {
      platform,
      status: 'dry_run',
      videoUrl: post.videoUrl,
      captionLength: [...post.captions[platform]].length,
    };
  }
  await maybeCheckPublicUrl(post, args);
  const posted = platform === 'instagram'
    ? await instagram.postReelToInstagram({
      text: post.captions.instagram,
      videoUrl: post.videoUrl,
      shareToFeed: post.shareToFeed !== false,
    })
    : await threads.postVideoToThreads({
      text: post.captions.threads,
      videoUrl: post.videoUrl,
      altText: post.altText || post.title,
    });
  state[key] = {
    status: 'posted',
    at: new Date().toISOString(),
    id: posted.id || posted.media?.id || null,
    permalink: posted.permalink || null,
  };
  results[key] = {
    ...state[key],
    postId: post.id,
    title: post.title,
    platform,
    sourceFile: rel(post.sourceFile),
  };
  await writeJson(STATE_FILE, state);
  await writeJson(RESULT_FILE, results);
  return { platform, status: 'posted', result: results[key] };
}

async function run(args) {
  const posts = loadApprovedPosts();
  const selected = posts.filter(post => {
    if (args.onlyId && post.id !== args.onlyId) return false;
    if (args.onlyId) return true;
    return isDue(post);
  });
  const report = {
    ok: true,
    mode: args.dryRun ? 'dry-run' : 'post',
    checkedAt: new Date().toISOString(),
    approvedManifestDir: rel(APPROVED_DIR),
    approvedPostCount: posts.length,
    selectedCount: selected.length,
    selected: selected.map(post => ({
      id: post.id,
      title: post.title,
      date: post.date,
      time: post.time,
      platforms: getRequestedPlatforms(args, post),
      due: isDue(post),
      sourceFile: rel(post.sourceFile),
    })),
    results: [],
  };
  if (args.list || !selected.length) return report;
  requirePostingEnabled(args);
  const state = await readJson(STATE_FILE, {});
  const results = await readJson(RESULT_FILE, {});
  for (const post of selected) {
    const platforms = getRequestedPlatforms(args, post);
    if (!platforms.length) {
      report.results.push({ id: post.id, status: 'skipped_no_requested_platforms' });
      continue;
    }
    const platformResults = [];
    for (const platform of platforms) {
      platformResults.push(await postToPlatform(post, platform, args, state, results));
    }
    report.results.push({ id: post.id, title: post.title, platforms: platformResults });
  }
  return report;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).then(report => {
    console.log(JSON.stringify(report, null, 2));
  }).catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  APPROVED_DIR,
  loadApprovedPosts,
  isDue,
  parseArgs,
  run,
};
