const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const instagram = require('./instagram-client');
const threads = require('./threads-client');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_RESULTS_FILE = path.join(ROOT, 'data', 'social-posts', 'approved-reels-results.json');
const DEFAULT_APPROVED_DIR = path.join(ROOT, 'data', 'social-posts', 'approved-reels');
const DEFAULT_OUT_DIR = path.join(ROOT, 'data', 'social-posts', 'video-insights');
const DEFAULT_LATEST_FILE = path.join(DEFAULT_OUT_DIR, 'latest.json');
const DEFAULT_DELETED_POSTS_FILE = path.join(ROOT, 'data', 'social-posts', 'deleted-posts.json');
const DEFAULT_PLATFORMS = 'threads,instagram';
const DEFAULT_SINCE_DAYS = 14;
const DEFAULT_MAX_POSTS = 80;
const INSTAGRAM_DEFAULT_METRICS = 'views,reach,likes,comments,saved,shares,total_interactions';
const THREADS_DEFAULT_METRICS = 'views,likes,replies,reposts,quotes,shares';

function resolveConfiguredPath(envName, fallback) {
  const configured = String(process.env[envName] || '').trim();
  if (!configured) return fallback;
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
}

const RESULT_FILE = resolveConfiguredPath('SOCIAL_APPROVED_REELS_RESULTS_FILE', DEFAULT_RESULTS_FILE);
const APPROVED_DIR = resolveConfiguredPath('SOCIAL_APPROVED_REELS_DIR', DEFAULT_APPROVED_DIR);
const OUT_DIR = resolveConfiguredPath('SOCIAL_VIDEO_INSIGHTS_DIR', DEFAULT_OUT_DIR);
const LATEST_FILE = resolveConfiguredPath('SOCIAL_VIDEO_INSIGHTS_LATEST_FILE', DEFAULT_LATEST_FILE);
const DELETED_POSTS_FILE = resolveConfiguredPath('SOCIAL_DELETED_POSTS_FILE', DEFAULT_DELETED_POSTS_FILE);

function parseArgs(argv) {
  const today = getJstDateKey();
  const args = {
    dryRun: true,
    live: false,
    from: '',
    to: today,
    sinceDays: Number(process.env.SOCIAL_VIDEO_INSIGHTS_SINCE_DAYS || DEFAULT_SINCE_DAYS),
    platforms: process.env.SOCIAL_VIDEO_INSIGHT_PLATFORMS || process.env.SOCIAL_PLATFORMS || DEFAULT_PLATFORMS,
    out: '',
    writeLatest: false,
    maxPosts: Number(process.env.SOCIAL_VIDEO_INSIGHTS_MAX_POSTS || DEFAULT_MAX_POSTS),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--live') {
      args.live = true;
      args.dryRun = false;
    } else if (arg === '--from') args.from = argv[++index] || '';
    else if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length);
    else if (arg === '--to') args.to = argv[++index] || args.to;
    else if (arg.startsWith('--to=')) args.to = arg.slice('--to='.length) || args.to;
    else if (arg === '--since-days') args.sinceDays = Number(argv[++index] || args.sinceDays);
    else if (arg.startsWith('--since-days=')) args.sinceDays = Number(arg.slice('--since-days='.length));
    else if (arg === '--platforms') args.platforms = argv[++index] || args.platforms;
    else if (arg.startsWith('--platforms=')) args.platforms = arg.slice('--platforms='.length);
    else if (arg === '--out') args.out = argv[++index] || '';
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--write-latest') args.writeLatest = true;
    else if (arg === '--max-posts') args.maxPosts = Number(argv[++index] || args.maxPosts);
    else if (arg.startsWith('--max-posts=')) args.maxPosts = Number(arg.slice('--max-posts='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.sinceDays) || args.sinceDays < 0 || args.sinceDays > 365) {
    throw new Error(`Invalid --since-days: ${args.sinceDays}`);
  }
  if (!Number.isInteger(args.maxPosts) || args.maxPosts < 1 || args.maxPosts > 500) {
    throw new Error(`Invalid --max-posts: ${args.maxPosts}`);
  }
  args.platforms = splitCsv(args.platforms).map(normalizePlatform);
  if (!args.platforms.length) throw new Error('At least one platform is required.');
  if (!args.from) args.from = addDays(args.to, -args.sinceDays);
  validateDate(args.from, '--from');
  validateDate(args.to, '--to');
  if (args.to < args.from) throw new Error(`--to must be on or after --from: ${args.from}..${args.to}`);
  args.out = args.out
    ? resolveRootPath(args.out)
    : path.join(OUT_DIR, `video-insights-${args.to}.json`);
  return args;
}

function splitCsv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function normalizePlatform(value) {
  const platform = String(value || '').trim().toLowerCase();
  if (!['threads', 'instagram'].includes(platform)) throw new Error(`Unsupported platform: ${value}`);
  return platform;
}

function validateDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`Invalid ${label} date: ${value}`);
}

function resolveRootPath(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function getNow() {
  const override = String(process.env.SOCIAL_NOW_ISO || '').trim();
  if (!override) return new Date();
  const date = new Date(override);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid SOCIAL_NOW_ISO: ${override}`);
  return date;
}

function getJstDateKey(date = getNow()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function readJsonSync(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function addRegistryValue(set, value) {
  const text = String(value || '').trim();
  if (text) set.add(text);
}

function buildDeletedPostRegistry(raw = null) {
  const registry = {
    keys: new Set(),
    mediaIds: new Set(),
    postIds: new Set(),
    permalinks: new Set(),
    sourceFiles: new Set(),
    dates: new Set(),
  };
  const addItem = item => {
    if (!item) return;
    if (typeof item === 'string') {
      addRegistryValue(registry.keys, item);
      addRegistryValue(registry.mediaIds, item);
      addRegistryValue(registry.postIds, item);
      return;
    }
    addRegistryValue(registry.keys, item.key || item.resultKey);
    addRegistryValue(registry.mediaIds, item.mediaId || item.id);
    addRegistryValue(registry.postIds, item.postId);
    addRegistryValue(registry.permalinks, item.permalink || item.url);
    addRegistryValue(registry.sourceFiles, item.sourceFile);
    addRegistryValue(registry.dates, item.date);
  };
  const items = Array.isArray(raw)
    ? raw
    : [
      ...(Array.isArray(raw?.deleted) ? raw.deleted : []),
      ...(Array.isArray(raw?.posts) ? raw.posts : []),
    ];
  for (const item of items) addItem(item);
  for (const key of ['keys', 'mediaIds', 'postIds', 'permalinks', 'sourceFiles', 'dates']) {
    for (const value of raw?.[key] || []) addRegistryValue(registry[key], value);
  }
  return registry;
}

function loadDeletedPostRegistry() {
  return buildDeletedPostRegistry(readJsonSync(DELETED_POSTS_FILE, null));
}

function registryHas(set, value) {
  const text = String(value || '').trim();
  return Boolean(text && set.has(text));
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

function inferTopicType(post = {}) {
  const raw = String(post.topicType || post.researchTarget || post.id || post.title || '').toLowerCase();
  if (/graph|グラフ/.test(raw)) return 'birthday_graph_1_31';
  if (/manual|取説/.test(raw)) return 'birthday_day_manual';
  if (/aruaru|あるある/.test(raw)) return 'birthday_day_aruaru';
  if (/top5|top 5|top５|top\s*5|ｔｏｐ|TOP5/i.test(String(post.title || post.id || ''))) return 'birthday_top5';
  return 'birthday_video';
}

function loadApprovedPostIndex() {
  const index = new Map();
  for (const file of walkJsonFiles(APPROVED_DIR)) {
    const manifest = readJsonSync(file, null);
    if (!manifest || typeof manifest !== 'object') continue;
    for (const post of manifest.posts || []) {
      if (!post?.id) continue;
      index.set(post.id, {
        id: post.id,
        date: post.date || '',
        time: post.time || '',
        title: post.title || '',
        kind: post.kind || 'birthday_reel',
        topicType: inferTopicType(post),
        researchTarget: post.researchTarget || '',
        sourceFile: rel(file),
        videoPath: post.videoPath || '',
        miniCharacters: post.designReview?.miniCharacters || post.miniCharacters || [],
      });
    }
  }
  return index;
}

function dateFromResultKey(key, result) {
  const keyMatch = String(key || '').match(/^(\d{4}-\d{2}-\d{2}):/);
  if (keyMatch) return keyMatch[1];
  const postMatch = String(result?.postId || '').match(/_(\d{8})_/);
  if (postMatch) {
    return `${postMatch[1].slice(0, 4)}-${postMatch[1].slice(4, 6)}-${postMatch[1].slice(6, 8)}`;
  }
  return String(result?.at || '').slice(0, 10);
}

function isDeletedPostResult(key, result, approved = {}, registry = buildDeletedPostRegistry()) {
  const status = String(result?.status || '').toLowerCase();
  if (['deleted', 'user_deleted', 'deleted_user_reported', 'removed'].includes(status)) return true;
  if (result?.deleted === true || result?.userDeleted === true || result?.deletedAt) return true;
  const date = dateFromResultKey(key, result);
  return registryHas(registry.keys, key)
    || registryHas(registry.mediaIds, result?.id || result?.mediaId)
    || registryHas(registry.postIds, result?.postId || approved.id)
    || registryHas(registry.permalinks, result?.permalink)
    || registryHas(registry.sourceFiles, result?.sourceFile || approved.sourceFile)
    || registryHas(registry.dates, date);
}

function selectTargets(results, approvedIndex, args, deletedRegistry = loadDeletedPostRegistry()) {
  const targets = [];
  for (const [key, result] of Object.entries(results || {})) {
    if (!result || result.status !== 'posted') continue;
    const platform = normalizePlatform(result.platform || String(key).split(':').pop());
    if (!args.platforms.includes(platform)) continue;
    if (!result.id) continue;
    const date = dateFromResultKey(key, result);
    if (!date || date < args.from || date > args.to) continue;
    const approved = approvedIndex.get(result.postId) || {};
    if (isDeletedPostResult(key, result, approved, deletedRegistry)) continue;
    targets.push({
      key,
      date,
      platform,
      mediaId: String(result.id),
      permalink: result.permalink || null,
      postId: result.postId || null,
      title: result.title || approved.title || '',
      postedAt: result.at || null,
      sourceFile: result.sourceFile || approved.sourceFile || '',
      time: approved.time || timeFromPostId(result.postId) || '',
      kind: approved.kind || 'birthday_reel',
      topicType: approved.topicType || inferTopicType({ id: result.postId, title: result.title }),
      researchTarget: approved.researchTarget || '',
      videoPath: approved.videoPath || '',
      miniCharacters: approved.miniCharacters || [],
    });
  }
  return targets
    .sort((a, b) => `${a.date} ${a.time} ${a.platform} ${a.postId}`.localeCompare(`${b.date} ${b.time} ${b.platform} ${b.postId}`))
    .slice(-args.maxPosts);
}

function timeFromPostId(postId) {
  const match = String(postId || '').match(/_(\d{4})_/);
  if (!match) return '';
  return `${match[1].slice(0, 2)}:${match[1].slice(2, 4)}`;
}

function metricListForPlatform(platform) {
  if (platform === 'instagram') {
    return splitCsv(process.env.INSTAGRAM_REELS_INSIGHT_METRICS || INSTAGRAM_DEFAULT_METRICS);
  }
  return splitCsv(process.env.THREADS_INSIGHT_METRICS || THREADS_DEFAULT_METRICS);
}

function metricValue(item) {
  if (item?.total_value && Object.prototype.hasOwnProperty.call(item.total_value, 'value')) return item.total_value.value;
  if (Array.isArray(item?.values) && item.values.length) {
    const last = item.values[item.values.length - 1];
    if (last && Object.prototype.hasOwnProperty.call(last, 'value')) return last.value;
  }
  if (item && Object.prototype.hasOwnProperty.call(item, 'value')) return item.value;
  return null;
}

function collectMetricItems(raw, fallbackMetric) {
  const items = Array.isArray(raw?.data) ? raw.data : [];
  if (items.length) return items;
  if (raw && typeof raw === 'object') return [{ ...raw, name: raw.name || fallbackMetric }];
  return [];
}

async function requestMetric(platform, mediaId, metric) {
  if (platform === 'instagram') {
    return instagram.getInstagramMediaInsights(mediaId, { metrics: [metric] });
  }
  return threads.getThreadInsights(mediaId, { metrics: [metric] });
}

async function collectTarget(target) {
  const metrics = {};
  const metricStatus = [];
  for (const metric of metricListForPlatform(target.platform)) {
    try {
      const raw = await requestMetric(target.platform, target.mediaId, metric);
      for (const item of collectMetricItems(raw, metric)) {
        const name = String(item.name || item.title || metric).trim() || metric;
        metrics[name] = metricValue(item);
      }
      metricStatus.push({ metric, status: 'collected' });
    } catch (error) {
      metricStatus.push({ metric, status: 'error', message: error?.message || String(error) });
    }
  }
  return {
    ...target,
    status: 'collected',
    collectedAt: new Date().toISOString(),
    metrics,
    metricStatus,
  };
}

function collectionEnabled() {
  return process.env.SOCIAL_INSIGHTS_COLLECTION_ENABLED === 'true';
}

async function run(args = parseArgs(process.argv.slice(2))) {
  const approvedIndex = loadApprovedPostIndex();
  const results = readJsonSync(RESULT_FILE, {});
  const deletedRegistry = loadDeletedPostRegistry();
  const targets = selectTargets(results, approvedIndex, args, deletedRegistry);
  const baseReport = {
    ok: true,
    status: args.dryRun ? 'dry_run' : 'live',
    collectedAt: new Date().toISOString(),
    sourceResultFile: rel(RESULT_FILE),
    deletedPostRegistry: fs.existsSync(DELETED_POSTS_FILE) ? rel(DELETED_POSTS_FILE) : '',
    approvedManifestDir: rel(APPROVED_DIR),
    from: args.from,
    to: args.to,
    platforms: args.platforms,
    targetCount: targets.length,
    targets: targets.map(target => ({
      key: target.key,
      date: target.date,
      time: target.time,
      platform: target.platform,
      mediaId: target.mediaId,
      postId: target.postId,
      title: target.title,
      topicType: target.topicType,
      permalink: target.permalink,
    })),
    records: [],
  };
  if (args.dryRun) return baseReport;
  if (!collectionEnabled()) {
    return {
      ...baseReport,
      status: 'skipped_disabled',
      ok: true,
      requiredEnv: 'SOCIAL_INSIGHTS_COLLECTION_ENABLED=true',
      records: [],
    };
  }
  for (const target of targets) {
    baseReport.records.push(await collectTarget(target));
  }
  await writeJson(args.out, baseReport);
  if (args.writeLatest) await writeJson(LATEST_FILE, baseReport);
  return {
    ...baseReport,
    outputFile: rel(args.out),
    latestFile: args.writeLatest ? rel(LATEST_FILE) : '',
  };
}

if (require.main === module) {
  run().then(report => {
    console.log(JSON.stringify(report, null, 2));
  }).catch(error => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  buildDeletedPostRegistry,
  isDeletedPostResult,
  loadDeletedPostRegistry,
  parseArgs,
  run,
  selectTargets,
  inferTopicType,
  metricValue,
};
