const fs = require('fs/promises');
const path = require('path');

const instagramClient = require('./instagram-client');
const threadsClient = require('./threads-client');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REEL_PUBLIC_ORIGIN = 'https://raw.githubusercontent.com/tekechannnel-max/rashin_senjutsu/main';
const DEFAULT_STATE_FILE = path.join(ROOT, 'data', 'social-posts', 'daily-birthday-reels-state.json');
const POST_GRACE_MINUTES = Number(process.env.SOCIAL_REEL_POST_GRACE_MINUTES || process.env.SOCIAL_POST_GRACE_MINUTES || 59);
const CATCHUP_HOURS = Number(process.env.SOCIAL_REEL_CATCHUP_HOURS || 0);
const THREADS_GRAPH_BASE = process.env.THREADS_GRAPH_BASE || 'https://graph.threads.net/v1.0';
const DAILY_REELS_PAUSED = process.env.SOCIAL_DAILY_REELS_PAUSED === 'true';

const REELS = [
  {
    id: 'daily_reel_20260613_20_himitsu_mamorenai',
    date: '2026-06-13',
    time: '20:00',
    slug: 'himitsu-mamorenai',
    title: '秘密守れない生まれ日TOP5',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-13/himitsu-mamorenai/himitsu-mamorenai-reel-no-mask.mp4',
  },
  {
    id: 'daily_reel_20260613_21_mood_maker',
    date: '2026-06-13',
    time: '21:00',
    slug: 'mood-maker',
    title: 'ムードメーカー生まれ日TOP5',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-13/mood-maker/mood-maker-reel-no-mask.mp4',
  },
  {
    id: 'daily_reel_20260613_22_creator_type',
    date: '2026-06-13',
    time: '22:00',
    slug: 'creator-type',
    title: 'クリエイター気質生まれ日TOP5',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-13/creator-type/creator-type-reel-no-mask.mp4',
  },
];

function parseArgs(argv) {
  const args = { dryRun: false, post: false, yes: false, force: false, platforms: ['threads', 'instagram'] };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--post') args.post = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--force') args.force = true;
    else if (arg.startsWith('--platforms=')) {
      args.platforms = arg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean);
    }
  }
  if (!args.post) args.dryRun = true;
  const invalid = args.platforms.filter(platform => !['threads', 'instagram'].includes(platform));
  if (invalid.length) throw new Error(`Unsupported platforms: ${invalid.join(', ')}`);
  return args;
}

function getPublicOrigin() {
  const origin = String(process.env.SOCIAL_REEL_PUBLIC_ORIGIN || DEFAULT_REEL_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
  if (!origin) throw new Error('SOCIAL_REEL_PUBLIC_ORIGIN or PUBLIC_ORIGIN is required for reel video URLs.');
  return origin;
}

function relativePathToPublicUrl(relativePath) {
  const encodedPath = relativePath
    .split(/[\\/]+/)
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${getPublicOrigin()}/${encodedPath}`;
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
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`Invalid time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

async function readJson(file, fallback) {
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

function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function instagramCaption(item) {
  return [
    item.title,
    '',
    '当てはまったら保存',
    '周りの人の誕生日も見てみて',
    '何日生まれかコメントで教えてね',
    '',
    'プロフィールのリンクから無料占い',
    '',
    '#羅針占術 #誕生日占い #数秘 #誕生日数 #占い好きな人と繋がりたい',
  ].join('\n');
}

function threadsText(item) {
  return [
    '\\無料占いはプロフィールURLから/',
    '',
    item.title,
    '',
    '当てはまったら保存',
    '周りの人の誕生日も見てみて',
    '何日生まれかコメントで教えてね',
    '',
    '占い師のつぶやき',
  ].join('\n');
}

async function findExistingInstagramReelByCaption(text) {
  const expected = normalizeText(text);
  const recent = await instagramClient.listInstagramMedia({ limit: Number(process.env.INSTAGRAM_REEL_DUPLICATE_LOOKBACK || 50) });
  return (recent.data || []).find(post => {
    const mediaType = String(post.media_type || '').toUpperCase();
    if (!['VIDEO', 'REELS'].includes(mediaType)) return false;
    return normalizeText(post.caption) === expected;
  }) || null;
}

async function requestThreadsJson(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || JSON.stringify(json);
    throw new Error(`Threads API request failed: ${res.status} ${message}`);
  }
  return json;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function assertExpectedThreadsAccount(credentials = null) {
  const expected = threadsClient.normalizeUsername(process.env.THREADS_EXPECTED_USERNAME);
  if (!expected) {
    if (process.env.THREADS_ALLOW_ANY_ACCOUNT === 'true') return null;
    throw new Error('Set THREADS_EXPECTED_USERNAME=sensai_teke before real Threads posting.');
  }
  const me = await threadsClient.getThreadsMe(credentials);
  const actual = threadsClient.normalizeUsername(me.username);
  if (actual !== expected) {
    throw new Error(`Threads token belongs to @${actual || 'unknown'}, expected @${expected}.`);
  }
  return me;
}

async function getThreadsContainerStatus(containerId, credentials) {
  const params = new URLSearchParams({
    fields: 'id,status,error_message',
    access_token: credentials.accessToken,
  });
  return requestThreadsJson(`${THREADS_GRAPH_BASE}/${encodeURIComponent(containerId)}?${params.toString()}`);
}

async function waitForThreadsContainer(containerId, credentials) {
  const timeoutMs = Number(process.env.THREADS_CONTAINER_TIMEOUT_MS || 120000);
  const intervalMs = Number(process.env.THREADS_CONTAINER_POLL_MS || 5000);
  const started = Date.now();
  let last = null;
  while (Date.now() - started <= timeoutMs) {
    last = await getThreadsContainerStatus(containerId, credentials);
    const status = String(last.status || '').toUpperCase();
    if (['FINISHED', 'READY', 'PUBLISHED'].includes(status)) return last;
    if (['ERROR', 'EXPIRED'].includes(status)) {
      throw new Error(`Threads video container ${containerId} failed with status ${status}: ${last.error_message || 'no error_message'}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Threads video container ${containerId} was not ready within ${timeoutMs}ms. Last status: ${JSON.stringify(last)}`);
}

async function postVideoToThreads({ text, videoUrl, altText }) {
  const credentials = await threadsClient.getThreadsCredentials();
  await assertExpectedThreadsAccount(credentials);
  threadsClient.ensureThreadsText(text);
  threadsClient.ensurePublicMediaUrl(videoUrl);
  const body = new URLSearchParams({
    media_type: 'VIDEO',
    video_url: videoUrl,
    text,
    access_token: credentials.accessToken,
  });
  if (altText) body.set('alt_text', altText);
  const created = await requestThreadsJson(`${THREADS_GRAPH_BASE}/${encodeURIComponent(credentials.userId)}/threads`, { method: 'POST', body });
  await waitForThreadsContainer(created.id, credentials);
  const published = await requestThreadsJson(`${THREADS_GRAPH_BASE}/${encodeURIComponent(credentials.userId)}/threads_publish`, {
    method: 'POST',
    body: new URLSearchParams({
      creation_id: created.id,
      access_token: credentials.accessToken,
    }),
  });
  const verified = await threadsClient.verifyPublishedThread(published.id, {
    credentials,
    timeoutMs: Number(process.env.THREADS_POST_VERIFY_TIMEOUT_MS || 120000),
    intervalMs: Number(process.env.THREADS_POST_VERIFY_INTERVAL_MS || 10000),
  });
  return { ...published, permalink: verified.permalink, verified: true, videoContainer: created.id };
}

async function findExistingThreadByText(text) {
  const expected = normalizeText(text);
  const recent = await threadsClient.listThreads({ limit: Number(process.env.THREADS_DUPLICATE_LOOKBACK || 50) });
  return (recent.data || []).find(post => normalizeText(post.text) === expected) || null;
}

async function buildReelEntry(item) {
  const videoPath = path.join(ROOT, item.videoRelativePath);
  await fs.stat(videoPath);
  return {
    ...item,
    instagramText: instagramCaption(item),
    threadsText: threadsText(item),
    videoPath,
    videoUrl: relativePathToPublicUrl(item.videoRelativePath),
    altText: `${item.title}の縦型リール動画。ランキングと理由の文字を隠さず表示しています。`,
  };
}

function getScheduledDate(item) {
  const date = new Date(`${item.date}T${item.time}:00+09:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid reel schedule: ${item.date} ${item.time}`);
  return date;
}

function isDue(item, dateKey, nowMinute, now = new Date()) {
  const scheduledMinute = parseTimeToMinutes(item.time);
  if (item.date === dateKey) {
    const lateByMinutes = nowMinute - scheduledMinute;
    if (lateByMinutes >= 0 && lateByMinutes <= POST_GRACE_MINUTES) return true;
  }
  if (!Number.isFinite(CATCHUP_HOURS) || CATCHUP_HOURS <= 0) return false;
  const lateByMs = now.getTime() - getScheduledDate(item).getTime();
  return lateByMs >= 0 && lateByMs <= CATCHUP_HOURS * 60 * 60 * 1000;
}

function stateEntry(state, item) {
  state[item.date] = state[item.date] || {};
  state[item.date][item.id] = state[item.date][item.id] || {};
  return state[item.date][item.id];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.post && !args.yes && process.env.SOCIAL_SCHEDULED_RUN !== 'true') {
    throw new Error('Real reel posting requires --yes, or SOCIAL_SCHEDULED_RUN=true in the cloud scheduler.');
  }
  if (args.post && process.env.SOCIAL_AUTOMATED_POSTING_ENABLED !== 'true') {
    throw new Error('Set SOCIAL_AUTOMATED_POSTING_ENABLED=true before real automated reel posting.');
  }

  const now = getNow();
  const dateKey = getJstDateKey(now);
  const nowMinute = getJstMinutes(now);
  const stateFile = process.env.SOCIAL_REEL_STATE_FILE || DEFAULT_STATE_FILE;
  const state = await readJson(stateFile, {});

  const entries = [];
  for (const item of REELS) {
    const entry = await buildReelEntry(item);
    const posted = stateEntry(state, entry);
    entries.push({
      ...entry,
      due: !DAILY_REELS_PAUSED && (args.force || isDue(entry, dateKey, nowMinute, now)),
      alreadyPosted: {
        instagram: Boolean(posted.instagram),
        threads: Boolean(posted.threads),
      },
    });
  }

  const report = {
    date: dateKey,
    nowMinute,
    catchupHours: CATCHUP_HOURS,
    graceMinutes: POST_GRACE_MINUTES,
    platforms: args.platforms,
    postType: 'reel_video',
    dryRun: args.dryRun,
    force: args.force,
    paused: DAILY_REELS_PAUSED,
    reels: entries.map(entry => ({
      id: entry.id,
      scheduledAt: `${entry.date} ${entry.time} Asia/Tokyo`,
      slug: entry.slug,
      title: entry.title,
      videoPath: entry.videoPath,
      videoUrl: entry.videoUrl,
      due: entry.due,
      alreadyPosted: entry.alreadyPosted,
      instagramCaption: entry.instagramText,
      threadsText: entry.threadsText,
    })),
  };
  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun || !args.post) return;

  const results = {};
  for (const entry of entries.filter(candidate => candidate.due)) {
    const posted = stateEntry(state, entry);
    results[entry.id] = {};

    if (args.platforms.includes('instagram') && !posted.instagram) {
      const existing = await findExistingInstagramReelByCaption(entry.instagramText);
      if (existing) {
        results[entry.id].instagram = {
          skipped: true,
          reason: 'existing_instagram_reel',
          id: existing.id,
          permalink: existing.permalink,
          timestamp: existing.timestamp,
          media_type: existing.media_type,
        };
      } else {
        results[entry.id].instagram = await instagramClient.postReelToInstagram({
          text: entry.instagramText,
          videoUrl: entry.videoUrl,
          shareToFeed: true,
        });
      }
      posted.instagram = new Date().toISOString();
      await writeJson(stateFile, state);
    }

    if (args.platforms.includes('threads') && !posted.threads) {
      const existing = await findExistingThreadByText(entry.threadsText);
      if (existing) {
        results[entry.id].threads = {
          skipped: true,
          reason: 'existing_threads_post',
          id: existing.id,
          permalink: existing.permalink,
          timestamp: existing.timestamp,
          media_type: existing.media_type,
        };
      } else {
        results[entry.id].threads = await postVideoToThreads({
          text: entry.threadsText,
          videoUrl: entry.videoUrl,
          altText: entry.altText,
        });
      }
      posted.threads = new Date().toISOString();
      await writeJson(stateFile, state);
    }
  }

  console.log(JSON.stringify({ posted: results }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
