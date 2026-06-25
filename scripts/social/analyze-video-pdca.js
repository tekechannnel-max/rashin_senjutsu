const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_INSIGHTS_DIR = path.join(ROOT, 'data', 'social-posts', 'video-insights');
const DEFAULT_APPROVED_DIR = path.join(ROOT, 'data', 'social-posts', 'approved-reels');
const DEFAULT_OUT_DIR = path.join(ROOT, 'output', 'social-pdca');
const DEFAULT_FEEDBACK_FILE = path.join(ROOT, 'data', 'social-posts', 'pdca', 'video-insights-feedback.json');
const DEFAULT_TOPIC_TYPES = [
  'birthday_top5',
  'birthday_day_aruaru',
  'birthday_day_manual',
  'birthday_graph_1_31',
];

function resolveConfiguredPath(envName, fallback) {
  const configured = String(process.env[envName] || '').trim();
  if (!configured) return fallback;
  return path.isAbsolute(configured) ? configured : path.resolve(ROOT, configured);
}

const INSIGHTS_DIR = resolveConfiguredPath('SOCIAL_VIDEO_INSIGHTS_DIR', DEFAULT_INSIGHTS_DIR);
const APPROVED_DIR = resolveConfiguredPath('SOCIAL_APPROVED_REELS_DIR', DEFAULT_APPROVED_DIR);
const FEEDBACK_FILE = resolveConfiguredPath('SOCIAL_VIDEO_PDCA_FEEDBACK_FILE', DEFAULT_FEEDBACK_FILE);

function parseArgs(argv) {
  const today = getJstDateKey();
  const args = {
    insightsFile: '',
    insightsDir: INSIGHTS_DIR,
    from: '',
    to: '',
    out: path.join(DEFAULT_OUT_DIR, `video-pdca-${today}.json`),
    writeFeedback: false,
    feedbackOut: FEEDBACK_FILE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--insights-file') args.insightsFile = argv[++index] || '';
    else if (arg.startsWith('--insights-file=')) args.insightsFile = arg.slice('--insights-file='.length);
    else if (arg === '--insights-dir') args.insightsDir = argv[++index] || args.insightsDir;
    else if (arg.startsWith('--insights-dir=')) args.insightsDir = arg.slice('--insights-dir='.length);
    else if (arg === '--from') args.from = argv[++index] || '';
    else if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length);
    else if (arg === '--to') args.to = argv[++index] || '';
    else if (arg.startsWith('--to=')) args.to = arg.slice('--to='.length);
    else if (arg === '--out') args.out = argv[++index] || args.out;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length) || args.out;
    else if (arg === '--write-feedback') args.writeFeedback = true;
    else if (arg === '--feedback-out') args.feedbackOut = argv[++index] || args.feedbackOut;
    else if (arg.startsWith('--feedback-out=')) args.feedbackOut = arg.slice('--feedback-out='.length) || args.feedbackOut;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.from && !/^\d{4}-\d{2}-\d{2}$/.test(args.from)) throw new Error(`Invalid --from date: ${args.from}`);
  if (args.to && !/^\d{4}-\d{2}-\d{2}$/.test(args.to)) throw new Error(`Invalid --to date: ${args.to}`);
  if (args.from && args.to && args.to < args.from) throw new Error(`--to must be on or after --from: ${args.from}..${args.to}`);
  args.insightsFile = args.insightsFile ? resolveRootPath(args.insightsFile) : '';
  args.insightsDir = resolveRootPath(args.insightsDir);
  args.out = resolveRootPath(args.out);
  args.feedbackOut = resolveRootPath(args.feedbackOut);
  return args;
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

function inferTopicType(post = {}) {
  const raw = String(post.topicType || post.researchTarget || post.id || post.title || '').toLowerCase();
  const title = String(post.title || post.id || '');
  if (/graph|グラフ/.test(raw) || /グラフ/.test(title)) return 'birthday_graph_1_31';
  if (/manual|取説/.test(raw) || /取説/.test(title)) return 'birthday_day_manual';
  if (/aruaru|あるある/.test(raw) || /あるある/.test(title)) return 'birthday_day_aruaru';
  if (/top5|top 5|top５/i.test(raw) || /TOP5|Top5|top5/.test(title)) return 'birthday_top5';
  return 'birthday_video';
}

function loadApprovedPostIndex() {
  const index = new Map();
  for (const file of walkJsonFiles(APPROVED_DIR)) {
    const manifest = readJson(file, null);
    if (!manifest || typeof manifest !== 'object') continue;
    for (const post of manifest.posts || []) {
      if (!post?.id) continue;
      index.set(post.id, {
        id: post.id,
        date: post.date || '',
        time: post.time || '',
        title: post.title || '',
        topicType: inferTopicType(post),
        researchTarget: post.researchTarget || '',
        sourceFile: rel(file),
      });
    }
  }
  return index;
}

function insightFiles(args) {
  if (args.insightsFile) return [args.insightsFile];
  return walkJsonFiles(args.insightsDir).filter(file => path.basename(file) !== 'README.json');
}

function normalizeRecord(record, approvedIndex) {
  const approved = approvedIndex.get(record.postId) || {};
  return {
    ...record,
    date: record.date || approved.date || '',
    time: record.time || approved.time || '',
    title: record.title || approved.title || '',
    topicType: record.topicType || approved.topicType || inferTopicType(record),
    researchTarget: record.researchTarget || approved.researchTarget || '',
    sourceFile: record.sourceFile || approved.sourceFile || '',
  };
}

function loadRecords(args) {
  const approvedIndex = loadApprovedPostIndex();
  const byKey = new Map();
  const files = insightFiles(args);
  for (const file of files) {
    const snapshot = readJson(file, null);
    if (!snapshot || typeof snapshot !== 'object') continue;
    const records = Array.isArray(snapshot.records) ? snapshot.records : [];
    for (const rawRecord of records) {
      const record = normalizeRecord(rawRecord, approvedIndex);
      if (args.from && record.date < args.from) continue;
      if (args.to && record.date > args.to) continue;
      const key = record.key || `${record.date}:${record.postId}:${record.platform}:${record.mediaId}`;
      const current = byKey.get(key);
      const nextAt = String(record.collectedAt || snapshot.collectedAt || '');
      const currentAt = String(current?.collectedAt || '');
      if (!current || nextAt >= currentAt) byKey.set(key, { ...record, key, sourceInsightFile: rel(file), collectedAt: nextAt });
    }
  }
  return { files: files.map(rel), records: [...byKey.values()] };
}

function numeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) return numeric(value.value);
    if (Object.prototype.hasOwnProperty.call(value, 'count')) return numeric(value.count);
  }
  return 0;
}

function pickMetric(metrics, names) {
  for (const name of names) {
    if (metrics && Object.prototype.hasOwnProperty.call(metrics, name)) return numeric(metrics[name]);
  }
  return 0;
}

function scoreRecord(record) {
  const metrics = record.metrics || {};
  const views = pickMetric(metrics, ['views', 'plays', 'reach', 'impressions']);
  const saves = pickMetric(metrics, ['saves', 'saved']);
  const shares = pickMetric(metrics, ['shares', 'reposts', 'reposts_or_shares']);
  const replies = pickMetric(metrics, ['replies', 'comments']);
  const likes = pickMetric(metrics, ['likes']);
  const profileVisits = pickMetric(metrics, ['profile_visits', 'profile_activity']);
  const totalInteractions = pickMetric(metrics, ['total_interactions']);
  const weightedActions = (saves * 10) + (profileVisits * 10) + (shares * 7) + (replies * 6) + (likes * 1.5) + (totalInteractions * 1);
  const reachLift = views > 0 ? Math.log10(views + 1) * 5 : 0;
  const score = Number((weightedActions + reachLift).toFixed(4));
  const actionCount = saves + shares + replies + likes + profileVisits;
  return {
    ...record,
    score,
    metricSummary: {
      views,
      saves,
      shares,
      replies,
      likes,
      profileVisits,
      totalInteractions,
      actionCount,
      engagementRate: views > 0 ? Number((actionCount / views).toFixed(6)) : 0,
      saveRate: views > 0 ? Number((saves / views).toFixed(6)) : 0,
      profileVisitRate: views > 0 ? Number((profileVisits / views).toFixed(6)) : 0,
    },
  };
}

function aggregate(records, keyFn) {
  const map = new Map();
  for (const record of records) {
    const key = keyFn(record) || 'unknown';
    const item = map.get(key) || {
      key,
      count: 0,
      score: 0,
      views: 0,
      saves: 0,
      shares: 0,
      replies: 0,
      likes: 0,
      profileVisits: 0,
      engagementRate: 0,
    };
    item.count += 1;
    item.score += record.score;
    item.views += record.metricSummary.views;
    item.saves += record.metricSummary.saves;
    item.shares += record.metricSummary.shares;
    item.replies += record.metricSummary.replies;
    item.likes += record.metricSummary.likes;
    item.profileVisits += record.metricSummary.profileVisits;
    item.engagementRate += record.metricSummary.engagementRate;
    map.set(key, item);
  }
  return [...map.values()].map(item => ({
    ...item,
    avgScore: Number((item.score / item.count).toFixed(4)),
    avgEngagementRate: Number((item.engagementRate / item.count).toFixed(6)),
  })).sort((a, b) => b.avgScore - a.avgScore || b.avgEngagementRate - a.avgEngagementRate || a.key.localeCompare(b.key));
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

function buildFeedback(scored, groups, reportPath) {
  const topicBaseline = groups.topicTypes.length
    ? groups.topicTypes.reduce((sum, item) => sum + item.avgScore, 0) / groups.topicTypes.length
    : 1;
  const topicTypeWeights = Object.fromEntries(DEFAULT_TOPIC_TYPES.map(topicType => [topicType, 1]));
  for (const group of groups.topicTypes) {
    if (DEFAULT_TOPIC_TYPES.includes(group.key)) {
      topicTypeWeights[group.key] = Number(clamp(group.avgScore / Math.max(topicBaseline, 1), 0.8, 1.25).toFixed(3));
    }
  }
  const preferredTopicTypes = groups.topicTypes
    .filter(item => DEFAULT_TOPIC_TYPES.includes(item.key))
    .slice(0, 3)
    .map(item => item.key);
  const preferredTimes = groups.times.slice(0, 3).map(item => item.key);
  const topPost = scored[0] || null;
  const lowSaveSignals = scored.filter(record => record.metricSummary.views >= 100 && record.metricSummary.saveRate < 0.01).slice(0, 5)
    .map(record => record.postId);
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sourceReport: reportPath ? rel(reportPath) : '',
    objective: 'night_video_saves_profile_visits_replies_shares',
    preferredTopicTypes,
    preferredTimes,
    topicTypeWeights,
    topSignals: topPost ? [{
      postId: topPost.postId,
      title: topPost.title,
      topicType: topPost.topicType,
      time: topPost.time,
      platform: topPost.platform,
      score: topPost.score,
      metrics: topPost.metricSummary,
    }] : [],
    avoidSignals: lowSaveSignals,
    nextResearchDirectives: buildRecommendations(scored, groups),
  };
}

function buildRecommendations(scored, groups) {
  if (!scored.length) {
    return [
      '投稿済み動画のインサイトスナップショットが不足しています。先に social:video-insights を live で実行してください。',
    ];
  }
  const directives = [];
  const bestTopic = groups.topicTypes[0];
  const bestTime = groups.times[0];
  if (bestTopic) directives.push(`${bestTopic.key} を次回候補の優先型にします。保存・プロフィール訪問・返信/コメントの合算スコアが最も高いです。`);
  if (bestTime) directives.push(`${bestTime.key} 枠を強めます。冒頭1秒で生まれ日が見える構成を維持してください。`);
  const weakSaveCount = scored.filter(record => record.metricSummary.views >= 100 && record.metricSummary.saveRate < 0.01).length;
  if (weakSaveCount) directives.push('保存率が低い動画は、タイトル直下に「自分と周りの生まれ日を確認できる」理由を増やしてください。');
  const weakProfileCount = scored.filter(record => record.metricSummary.views >= 100 && record.metricSummary.profileVisitRate < 0.002).length;
  if (weakProfileCount) directives.push('プロフィール訪問率が低い動画は、保存CTAの後に羅針占術で深掘りできる対象を1行だけ具体化してください。');
  return directives;
}

async function run(args = parseArgs(process.argv.slice(2))) {
  const loaded = loadRecords(args);
  const scored = loaded.records
    .filter(record => record.status !== 'planned' && record.metrics && Object.keys(record.metrics).length)
    .map(scoreRecord)
    .sort((a, b) => b.score - a.score || String(a.postId).localeCompare(String(b.postId)));
  const groups = {
    topicTypes: aggregate(scored, record => record.topicType),
    times: aggregate(scored, record => record.time),
    platforms: aggregate(scored, record => record.platform),
  };
  const topPosts = scored.slice(0, 10).map(record => ({
    postId: record.postId,
    title: record.title,
    date: record.date,
    time: record.time,
    platform: record.platform,
    topicType: record.topicType,
    score: record.score,
    metrics: record.metricSummary,
    permalink: record.permalink || null,
  }));
  const feedback = buildFeedback(scored, groups, args.out);
  const report = {
    ok: true,
    status: scored.length ? 'analyzed' : 'no_scored_records',
    analyzedAt: new Date().toISOString(),
    sourceFiles: loaded.files,
    recordCount: loaded.records.length,
    scoredCount: scored.length,
    window: {
      from: args.from || null,
      to: args.to || null,
    },
    objective: 'Use video insights to improve next birthday reel research, production, and posting PDCA.',
    groups,
    topPosts,
    recommendations: feedback.nextResearchDirectives,
    feedback,
  };
  await writeJson(args.out, report);
  if (args.writeFeedback && scored.length) await writeJson(args.feedbackOut, feedback);
  return {
    ...report,
    outputFile: rel(args.out),
    feedbackFile: args.writeFeedback && scored.length ? rel(args.feedbackOut) : '',
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
  parseArgs,
  run,
  scoreRecord,
  inferTopicType,
};
