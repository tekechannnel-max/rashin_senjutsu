const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DAILY_SCRIPT = path.join(__dirname, 'daily-oracle-post.js');
const PRERELEASE_START_DATE = '2026-05-16';
const PRERELEASE_END_DATE = '2026-05-29';
const FIX_PERIOD_END_DATE = '2026-06-05';
const RELEASE_DATE = PRERELEASE_START_DATE;
const THREADS_LIMIT = 500;
const X_LIMIT = 280;
const BLUESKY_LIMIT = 300;
const BLUESKY_IMAGE_LIMIT_BYTES = 2 * 1024 * 1024;
const REQUIRED_HASHTAG = '#羅針占術';

const HARD_NG_PATTERNS = [
  ['断定的な的中表現', /絶対当たる|100%当たる|必ず当たる/],
  ['復縁や相手の気持ちの断定', /復縁できます|必ず戻ってくる|必ず戻る|運命の人/],
  ['不安を煽る購入誘導', /課金しないと|買わないと悪くなる|今すぐ購入しないと|このままだと不幸|手遅れ/],
  ['専門判断の代替', /病気が治る|投資で勝てる|法律的に大丈夫/],
];

const PRELAUNCH_LIVE_CTA_PATTERNS = [
  /あなたも今日の1枚を引かない？/,
  /今すぐ.*(引|使|試)/,
  /無料鑑定へ/,
  /アプリで試して/,
];

const PRELAUNCH_HARD_PAID_PATTERNS = [
  /BOOTH/,
  /注文番号/,
  /購入/,
  /価格/,
  /780円/,
  /1000円/,
  /有料/,
];

function parseArgs(argv) {
  const args = {
    from: process.env.SOCIAL_AUDIT_FROM || '2026-05-12',
    to: process.env.SOCIAL_AUDIT_TO || '2026-05-29',
    platforms: process.env.SOCIAL_PLATFORMS || 'threads',
    releaseMode: process.env.SOCIAL_RELEASE_MODE || 'auto',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') args.from = argv[++i] || args.from;
    else if (arg.startsWith('--from=')) args.from = arg.split('=')[1] || args.from;
    else if (arg === '--to') args.to = argv[++i] || args.to;
    else if (arg.startsWith('--to=')) args.to = arg.split('=')[1] || args.to;
    else if (arg === '--platforms') args.platforms = argv[++i] || args.platforms;
    else if (arg.startsWith('--platforms=')) args.platforms = arg.split('=')[1] || args.platforms;
    else if (arg === '--release-mode') args.releaseMode = argv[++i] || args.releaseMode;
    else if (arg.startsWith('--release-mode=')) args.releaseMode = arg.split('=')[1] || args.releaseMode;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.from)) throw new Error(`Invalid --from date: ${args.from}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.to)) throw new Error(`Invalid --to date: ${args.to}`);
  return args;
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eachDate(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function textLength(text) {
  return [...String(text || '')].length;
}

function countHashtags(text) {
  return (String(text || '').match(/(^|\s)#[^\s#]+/g) || []).length;
}

function hasPublicUrl(text) {
  return /https?:\/\//i.test(String(text || ''));
}

function hasUtm(text) {
  return /[?&]utm_content=/i.test(String(text || ''));
}

function getReleasePhase(dateKey) {
  if (dateKey < PRERELEASE_START_DATE) return 'prelaunch';
  if (dateKey <= PRERELEASE_END_DATE) return 'prerelease';
  if (dateKey <= FIX_PERIOD_END_DATE) return 'fix';
  return 'release';
}

function isPrelaunchDate(dateKey) {
  return getReleasePhase(dateKey) === 'prelaunch';
}

function hasPrelaunchAnchor(text) {
  return /5\/16|公開|プレリリース|先行/.test(String(text || ''));
}

function hasPrelaunchWaitCta(text) {
  return /フォロー|保存|見返|待って|公開を待/.test(String(text || ''));
}

function addIssue(issues, severity, code, message) {
  issues.push({ severity, code, message });
}

function auditText({ text, dateKey, kind, platform }) {
  const issues = [];
  const value = String(text || '');
  const length = textLength(value);
  const prelaunch = isPrelaunchDate(dateKey);
  const releasePhase = getReleasePhase(dateKey);
  const limit = platform === 'x' ? X_LIMIT : platform === 'bluesky' ? BLUESKY_LIMIT : THREADS_LIMIT;

  if (!value.trim()) addIssue(issues, 'error', 'empty', '投稿文が空です。');
  if (length > limit) addIssue(issues, 'error', 'length', `${platform}の文字数上限を超えています: ${length}/${limit}`);
  if (!value.includes(REQUIRED_HASHTAG)) addIssue(issues, 'error', 'hashtag_missing', `${REQUIRED_HASHTAG} がありません。`);
  const hashtagCount = countHashtags(value);
  if (platform === 'threads' && hashtagCount !== 1) {
    addIssue(issues, 'error', 'hashtag_count', `Threadsのハッシュタグは1つだけにします: ${hashtagCount}`);
  }
  if (platform === 'x' && (hashtagCount < 1 || hashtagCount > 2)) {
    addIssue(issues, 'error', 'hashtag_count', `Xのハッシュタグは1〜2個にします: ${hashtagCount}`);
  }
  if (platform === 'bluesky' && (hashtagCount < 1 || hashtagCount > 2)) {
    addIssue(issues, 'error', 'hashtag_count', `Blueskyのハッシュタグは1〜2個にします: ${hashtagCount}`);
  }

  for (const [label, pattern] of HARD_NG_PATTERNS) {
    if (pattern.test(value)) addIssue(issues, 'error', 'hard_ng', `${label}に該当する表現があります。`);
  }

  if (prelaunch) {
    if (hasPublicUrl(value)) addIssue(issues, 'error', 'prelaunch_url', 'プレリリース前の投稿にURLがあります。');
    if (hasUtm(value)) addIssue(issues, 'error', 'prelaunch_utm', 'プレリリース前の投稿にUTMがあります。');
    if (!hasPrelaunchAnchor(value)) addIssue(issues, 'error', 'prelaunch_anchor', '5/16公開前の先行投稿だと分かる文脈が不足しています。');
    if (!hasPrelaunchWaitCta(value)) addIssue(issues, 'error', 'prelaunch_cta', 'プレリリース前はフォロー/保存/待つCTAが必要です。');
    for (const pattern of PRELAUNCH_LIVE_CTA_PATTERNS) {
      if (pattern.test(value)) addIssue(issues, 'error', 'prelaunch_live_cta', 'まだ使えない行動を促すCTAがあります。');
    }
    for (const pattern of PRELAUNCH_HARD_PAID_PATTERNS) {
      if (pattern.test(value)) addIssue(issues, 'error', 'prelaunch_paid', 'プレリリース前に購入・価格・注文番号の強い導線があります。');
    }
    if (dateKey < '2026-05-15' && /深掘り鑑定/.test(value) && !/必要な方だけ|順に投稿|準備/.test(value)) {
      addIssue(issues, 'warn', 'early_deep_cta', '公開3日前以前の深掘り言及は弱めに抑えてください。');
    }
  } else if (platform === 'threads') {
    if (!hasPublicUrl(value)) addIssue(issues, 'error', 'postrelease_url', '公開後のThreads投稿には導線URLが必要です。');
    if (!hasUtm(value)) addIssue(issues, 'error', 'postrelease_utm', '公開後のThreads投稿にはutm_contentが必要です。');
    if (kind === 'oracle' && !value.trim().endsWith('あなたも今日の1枚を引かない？')) {
      addIssue(issues, 'error', 'oracle_closing', '公開後の朝オラクルは指定の締めで終える必要があります。');
    }
  }

  if (releasePhase === 'prerelease' && /正式リリース|本リリース/.test(value)) {
    addIssue(issues, 'error', 'prerelease_false_release', 'プレリリース期間中に正式リリース済みのような表現があります。');
  }
  if (releasePhase === 'fix' && /正式リリース|本リリース/.test(value)) {
    addIssue(issues, 'error', 'fix_false_release', '修正期間中に正式リリース済みのような表現があります。');
  }

  if (kind === 'oracle' && !/今日の1枚|テーマ|一手/.test(value)) {
    addIssue(issues, 'warn', 'oracle_structure', '朝オラクルとしてカード、テーマ、一手のどれかが弱いです。');
  }
  if (kind === 'concept' && !/未来を断定|整理|次の一手|本質|本音|現実|迷|流れ|占い|鑑定|確認|カード|オラクル|行動/.test(value)) {
    addIssue(issues, 'warn', 'concept_axis', '羅針占術の思想軸が弱い可能性があります。');
  }

  return { length, issues };
}

function auditImage({ draft, kind, platform }) {
  const issues = [];
  if (!['x', 'bluesky'].includes(platform)) return issues;
  const entry = draft[kind] || {};
  const imagePath = platform === 'bluesky' ? entry.blueskyImagePath : entry.imagePath;
  const altText = entry.altText;
  if (!imagePath) {
    addIssue(issues, 'error', `${platform}_image_missing`, `${platform}用投稿に画像パスがありません。`);
  } else if (!fs.existsSync(imagePath)) {
    addIssue(issues, 'error', `${platform}_image_not_found`, `${platform}用画像が見つかりません: ${imagePath}`);
  } else if (platform === 'bluesky') {
    const size = fs.statSync(imagePath).size;
    if (size > BLUESKY_IMAGE_LIMIT_BYTES) {
      addIssue(issues, 'error', 'bluesky_image_too_large', `Bluesky用画像が2MBを超えています: ${size}/${BLUESKY_IMAGE_LIMIT_BYTES} ${imagePath}`);
    }
  }
  if (!String(altText || '').trim()) {
    addIssue(issues, 'error', `${platform}_alt_missing`, `${platform}用画像のalt textがありません。`);
  }
  return issues;
}

function generateDraft(dateKey, args) {
  const env = {
    ...process.env,
    SOCIAL_STATELESS_MODE: 'true',
    SOCIAL_RELEASE_MODE: args.releaseMode,
    SOCIAL_PLATFORMS: args.platforms,
  };
  const result = spawnSync(process.execPath, [
    DAILY_SCRIPT,
    '--dry-run',
    `--date=${dateKey}`,
    '--kind=all',
    `--platforms=${args.platforms}`,
  ], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`Draft generation failed for ${dateKey}: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function summarizeResult(result) {
  const counts = result.entries.reduce((acc, entry) => {
    for (const issue of entry.issues) {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    }
    return acc;
  }, {});
  return {
    dates: result.dates,
    entries: result.entries.length,
    errors: counts.error || 0,
    warnings: counts.warn || 0,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const platforms = args.platforms.split(',').map(item => item.trim()).filter(Boolean);
  const result = { dates: eachDate(args.from, args.to), entries: [] };

  for (const dateKey of result.dates) {
    const draft = generateDraft(dateKey, args);
    for (const kind of ['oracle', 'concept']) {
      for (const platform of platforms) {
        const text = platform === 'x'
          ? draft[kind].xText
          : platform === 'bluesky'
            ? draft[kind].blueskyText
            : draft[kind].text;
        const audit = auditText({ text, dateKey, kind, platform, releaseMode: args.releaseMode });
        const imageIssues = auditImage({ draft, kind, platform });
        result.entries.push({
          date: dateKey,
          kind,
          platform,
          releasePhase: getReleasePhase(dateKey),
          length: audit.length,
          issues: [...audit.issues, ...imageIssues],
        });
      }
    }
  }

  const summary = summarizeResult(result);
  console.log(JSON.stringify({ summary, entries: result.entries }, null, 2));
  if (summary.errors > 0) {
    process.exitCode = 1;
  }
}

main();
