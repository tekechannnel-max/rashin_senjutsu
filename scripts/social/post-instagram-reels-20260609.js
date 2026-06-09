const fs = require('fs/promises');
const path = require('path');

const { buildDraft } = require('./daily-oracle-post');
const instagramClient = require('./instagram-client');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REEL_PUBLIC_ORIGIN = 'https://raw.githubusercontent.com/tekechannnel-max/rashin_senjutsu/main';
const DEFAULT_STATE_FILE = path.join(ROOT, 'data', 'social-posts', 'instagram-birthday-ranking-reels-state.json');
const POST_GRACE_MINUTES = Number(process.env.SOCIAL_REEL_POST_GRACE_MINUTES || process.env.SOCIAL_POST_GRACE_MINUTES || 59);

const REELS = [
  {
    id: 'instagram_reel_20260609_20_idol_style',
    date: '2026-06-09',
    time: '20:00',
    slug: 'idol_style',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-09/idol-style-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260609_21_love_style',
    date: '2026-06-09',
    time: '21:00',
    slug: 'love_style',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-09/love-style-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260609_22_amae_jouzu',
    date: '2026-06-09',
    time: '22:00',
    slug: 'amae_jouzu',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-09/amae-jouzu-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260609_23_buchigire_kowai',
    date: '2026-06-09',
    time: '23:00',
    slug: 'buchigire_kowai',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-09/buchigire-kowai-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260610_20_akisho_level',
    date: '2026-06-10',
    time: '20:00',
    slug: 'akisho_level',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-10/akisho-level-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260610_21_majime',
    date: '2026-06-10',
    time: '21:00',
    slug: 'majime',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-10/majime-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260610_22_uwaki_rate',
    date: '2026-06-10',
    time: '22:00',
    slug: 'uwaki_rate',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-10/uwaki-rate-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260610_23_nenimotsu_wasureru',
    date: '2026-06-10',
    time: '23:00',
    slug: 'nenimotsu_wasureru',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-10/nenimotsu-wasureru-reel-profile-emoji.mp4',
  },
  {
    id: 'instagram_reel_20260611_21_chuunibyou',
    date: '2026-06-11',
    time: '21:00',
    slug: 'chuunibyou',
    videoRelativePath: 'videos/social/instagram/【インスタ】あるある・ランキング系/2026-06-11/chuunibyou-reel-profile-emoji.mp4',
  },
];

function parseArgs(argv) {
  const args = { dryRun: false, post: false, yes: false, force: false };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--post') args.post = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--force') args.force = true;
  }
  if (!args.post) args.dryRun = true;
  return args;
}

function getPublicOrigin() {
  const origin = String(process.env.SOCIAL_REEL_PUBLIC_ORIGIN || DEFAULT_REEL_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || 'https://rashin-senjutsu.onrender.com').trim().replace(/\/+$/, '');
  if (!origin) throw new Error('SOCIAL_REEL_PUBLIC_ORIGIN or PUBLIC_ORIGIN is required for Instagram reel video URLs.');
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

async function findExistingInstagramReelByCaption(text) {
  const expected = normalizeText(text);
  const recent = await instagramClient.listInstagramMedia({ limit: Number(process.env.INSTAGRAM_REEL_DUPLICATE_LOOKBACK || 50) });
  return (recent.data || []).find(post => {
    const mediaType = String(post.media_type || '').toUpperCase();
    if (!['VIDEO', 'REELS'].includes(mediaType)) return false;
    return normalizeText(post.caption) === expected;
  }) || null;
}

async function buildReelEntry(item) {
  const draft = await buildDraft({
    date: item.date,
    kind: 'birthday_ranking',
    platforms: ['instagram'],
    birthdayRankingSlug: item.slug,
    dryRun: true,
  });
  const entry = draft.birthday_ranking;
  const videoPath = path.join(ROOT, item.videoRelativePath);
  await fs.stat(videoPath);
  return {
    ...item,
    title: entry.content.title,
    text: entry.instagramText,
    hashtags: String(entry.instagramText || '').split(/\r?\n/).filter(line => line.trim().startsWith('#')).join('\n'),
    videoPath,
    videoUrl: relativePathToPublicUrl(item.videoRelativePath),
    altText: entry.altText,
  };
}

function isDue(item, dateKey, nowMinute) {
  if (item.date !== dateKey) return false;
  const scheduledMinute = parseTimeToMinutes(item.time);
  const lateByMinutes = nowMinute - scheduledMinute;
  return lateByMinutes >= 0 && lateByMinutes <= POST_GRACE_MINUTES;
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
  state[dateKey] = state[dateKey] || {};

  const entries = [];
  for (const item of REELS) {
    const entry = await buildReelEntry(item);
    entries.push({
      ...entry,
      due: args.force || isDue(item, dateKey, nowMinute),
      alreadyPostedInState: Boolean(state[item.date]?.[item.id]),
    });
  }

  const report = {
    date: dateKey,
    nowMinute,
    graceMinutes: POST_GRACE_MINUTES,
    platform: 'instagram',
    postType: 'reel',
    dryRun: args.dryRun,
    force: args.force,
    reels: entries.map(entry => ({
      id: entry.id,
      scheduledAt: `${entry.date} ${entry.time} Asia/Tokyo`,
      slug: entry.slug,
      title: entry.title,
      videoPath: entry.videoPath,
      videoUrl: entry.videoUrl,
      due: entry.due,
      alreadyPostedInState: entry.alreadyPostedInState,
      caption: entry.text,
    })),
  };
  console.log(JSON.stringify(report, null, 2));

  if (args.dryRun || !args.post) return;

  const results = {};
  for (const entry of entries.filter(candidate => candidate.due && !candidate.alreadyPostedInState)) {
    const existing = await findExistingInstagramReelByCaption(entry.text);
    if (existing) {
      results[entry.id] = {
        skipped: true,
        reason: 'existing_instagram_reel',
        id: existing.id,
        permalink: existing.permalink,
        timestamp: existing.timestamp,
        media_type: existing.media_type,
      };
      state[entry.date] = state[entry.date] || {};
      state[entry.date][entry.id] = new Date().toISOString();
      await writeJson(stateFile, state);
      continue;
    }
    const posted = await instagramClient.postReelToInstagram({
      text: entry.text,
      videoUrl: entry.videoUrl,
      shareToFeed: true,
    });
    results[entry.id] = posted;
    state[entry.date] = state[entry.date] || {};
    state[entry.date][entry.id] = new Date().toISOString();
    await writeJson(stateFile, state);
  }
  console.log(JSON.stringify({ posted: results }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
