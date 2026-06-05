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
const INSTAGRAM_LIMIT = 2200;
const INSTAGRAM_HASHTAG_LIMIT = 5;
const DEFAULT_SOCIAL_PLATFORMS = 'threads,instagram';
const SUPPORTED_PLATFORMS = new Set(['threads', 'instagram']);
const SOCIAL_EXPANSION_START_DATE = process.env.SOCIAL_EXPANSION_START_DATE || '2026-05-27';
const REQUIRED_HASHTAGS_BY_PLATFORM = {
  threads: ['#占い師のつぶやき'],
  instagram: ['#羅針占術'],
};
const REQUIRED_HASHTAGS_BY_KIND = {
  rashin_point: {
    threads: ['#占い師'],
    instagram: ['#羅針占術'],
  },
  birthday_ranking: {
    instagram: ['#羅針占術', '#誕生日占い', '#数秘'],
  },
};
const SOCIAL_POST_KINDS = ['oracle', 'rashin_point', 'birthday_monthly', 'birthday_ranking'];
const SOCIAL_BIRTHDAY_MONTHLY_JUNE_DATE = process.env.SOCIAL_BIRTHDAY_MONTHLY_JUNE_DATE || '2026-06-05';
const SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE = process.env.SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE || '2026-07-01';
const ONE_OFF_POSTS = [
  { id: 'rashin_point', kind: 'rashin_point', date: '2026-06-04' },
  { id: 'birthday_ranking_love_at_first_sight', kind: 'birthday_ranking', date: '2026-06-06' },
  { id: 'birthday_ranking_money_luck', kind: 'birthday_ranking', date: '2026-06-07' },
  { id: 'birthday_ranking_horror_resistance', kind: 'birthday_ranking', date: '2026-06-08' },
  { id: 'birthday_ranking_weird', kind: 'birthday_ranking', date: '2026-06-09' },
];
const BIRTHDAY_MONTHLY_SLOTS = [
  { id: 'birthday_monthly_01_10', kind: 'birthday_monthly', birthdayDays: '1-10' },
  { id: 'birthday_monthly_11_20', kind: 'birthday_monthly', birthdayDays: '11-20' },
  { id: 'birthday_monthly_21_30', kind: 'birthday_monthly', birthdayDays: '21-30' },
  { id: 'birthday_monthly_31', kind: 'birthday_monthly', birthdayDays: '31' },
];
const WEEKDAYS_BY_KIND = {
  oracle: null,
};

const HARD_NG_PATTERNS = [
  ['断定的な的中表現', /絶対当たる|100%当たる|必ず当たる/],
  ['復縁や相手の気持ちの断定', /復縁できます|必ず戻ってくる|必ず戻る|運命の人/],
  ['不安を煽る購入誘導', /課金しないと|買わないと悪くなる|今すぐ購入しないと|このままだと不幸|手遅れ/],
  ['専門判断の代替', /病気が治る|投資で勝てる|法律的に大丈夫/],
];

const PRELAUNCH_LIVE_CTA_PATTERNS = [
  /今日の1枚はこちら/,
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

const MIDDAY_TOO_SPECIFIC_PATTERN = /恋愛|仕事|進路|お金|人間関係|復縁|曖昧な関係|収支|支出|連絡|評価|役割|境界線/;

function parseArgs(argv) {
  const args = {
    from: process.env.SOCIAL_AUDIT_FROM || '2026-05-13',
    to: process.env.SOCIAL_AUDIT_TO || '2026-05-29',
    platforms: process.env.SOCIAL_PLATFORMS || DEFAULT_SOCIAL_PLATFORMS,
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
  const platforms = args.platforms.split(',').map(item => item.trim()).filter(Boolean);
  const unsupported = platforms.filter(platform => !SUPPORTED_PLATFORMS.has(platform));
  if (unsupported.length) throw new Error(`Unsupported platform: ${unsupported.join(', ')}`);
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
  return /https?:\/\//i.test(String(text || '')) || /\brashin-senjutsu\.onrender\.com\b/i.test(String(text || ''));
}

function hasInstagramProfileLinkCue(text) {
  return String(text || '').includes('プロフィールのリンクから');
}

function hasUtm(text) {
  return /[?&]utm_content=/i.test(String(text || ''));
}

function normalizeForRepeat(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\butm_[a-z]+=[^\s&]+/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\d{1,2}\/\d{1,2}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getReleasePhase(dateKey) {
  if (dateKey < PRERELEASE_START_DATE) return 'prelaunch';
  if (dateKey <= PRERELEASE_END_DATE) return 'prerelease';
  if (dateKey <= FIX_PERIOD_END_DATE) return 'fix';
  return 'release';
}

function getWeekday(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

function isBirthdayMonthlyDate(dateKey) {
  return dateKey === SOCIAL_BIRTHDAY_MONTHLY_JUNE_DATE
    || (dateKey >= SOCIAL_BIRTHDAY_MONTHLY_MONTHLY_START_DATE && dateKey.endsWith('-01'));
}

function isScheduledItemForDate(item, dateKey) {
  if (item.date && item.date !== dateKey) return false;
  if (item.kind === 'birthday_monthly' && !isBirthdayMonthlyDate(dateKey)) return false;
  if (item.kind !== 'oracle' && dateKey < SOCIAL_EXPANSION_START_DATE) return false;
  const weekdays = WEEKDAYS_BY_KIND[item.kind];
  return !Array.isArray(weekdays) || weekdays.includes(getWeekday(dateKey));
}

function scheduledItemsForDate(dateKey) {
  return [
    { id: 'oracle', kind: 'oracle' },
    ...BIRTHDAY_MONTHLY_SLOTS,
    ...ONE_OFF_POSTS,
  ].filter(item => SOCIAL_POST_KINDS.includes(item.kind) && isScheduledItemForDate(item, dateKey));
}

function isPrelaunchDate(dateKey) {
  return getReleasePhase(dateKey) === 'prelaunch';
}

function hasPrelaunchAnchor(text) {
  return /5\/16|公開|プレリリース|先行/.test(String(text || ''));
}

function hasPrelaunchWaitCta(text) {
  return /フォロー|保存|見返|待って|公開を待|公開日にまた届きます/.test(String(text || ''));
}

function addIssue(issues, severity, code, message) {
  issues.push({ severity, code, message });
}

function auditText({ text, trackedUrl, dateKey, kind, platform }) {
  const issues = [];
  const value = String(text || '');
  const tracking = String(trackedUrl || '');
  const length = textLength(value);
  const prelaunch = isPrelaunchDate(dateKey);
  const releasePhase = getReleasePhase(dateKey);
  const limit = platform === 'instagram' ? INSTAGRAM_LIMIT : THREADS_LIMIT;

  if (!value.trim()) addIssue(issues, 'error', 'empty', '投稿文が空です。');
  if (length > limit) addIssue(issues, 'error', 'length', `${platform}の文字数上限を超えています: ${length}/${limit}`);
  if (platform === 'instagram') {
    if (kind !== 'birthday_ranking' && !hasInstagramProfileLinkCue(value)) {
      addIssue(issues, 'error', 'instagram_profile_link_missing', 'Instagram投稿にはプロフィールリンク誘導が必要です。');
    }
  } else if (platform !== 'instagram' && kind !== 'birthday_ranking' && !hasPublicUrl(value)) {
    addIssue(issues, 'error', 'visible_url_missing', `${platform}投稿には表示用URLが必要です。`);
  }
  if (!hasUtm(value) && !hasUtm(tracking)) addIssue(issues, 'error', 'utm_missing', `${platform}投稿には台帳用utm_contentが必要です。`);
  const requiredHashtags = REQUIRED_HASHTAGS_BY_KIND[kind]?.[platform] || REQUIRED_HASHTAGS_BY_PLATFORM[platform] || [];
  requiredHashtags.forEach(requiredHashtag => {
    if (!value.includes(requiredHashtag)) addIssue(issues, 'error', 'hashtag_missing', `${requiredHashtag} がありません。`);
  });
  if (platform === 'threads' && value.includes('#羅針占術')) {
    addIssue(issues, 'error', 'threads_brand_hashtag', 'Threads投稿では #羅針占術 を使わず #占い師のつぶやき のみにします。');
  }
  const hashtagCount = countHashtags(value);
  if (platform === 'threads' && hashtagCount !== requiredHashtags.length) {
    addIssue(issues, 'error', 'hashtag_count', `Threadsのハッシュタグは${requiredHashtags.length}つだけにします: ${hashtagCount}`);
  }
  if (platform === 'instagram') {
    if (kind === 'oracle' && !value.includes('#おはようvtuber')) {
      addIssue(issues, 'error', 'instagram_oracle_morning_hashtag_missing', 'Instagramのoracle投稿には #おはようvtuber が必要です。');
    }
    if (hashtagCount > INSTAGRAM_HASHTAG_LIMIT) {
      addIssue(issues, 'error', 'instagram_hashtag_count', `Instagramのハッシュタグは${INSTAGRAM_HASHTAG_LIMIT}個までにします: ${hashtagCount}`);
    }
    if (hashtagCount < 3) {
      addIssue(issues, 'warn', 'instagram_hashtag_too_few', `Instagramのハッシュタグが少なすぎます: ${hashtagCount}`);
    }
  }

  for (const [label, pattern] of HARD_NG_PATTERNS) {
    if (pattern.test(value)) addIssue(issues, 'error', 'hard_ng', `${label}に該当する表現があります。`);
  }

  if (prelaunch) {
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
    if (kind === 'oracle' && !value.includes('今日の1枚はこちら！👇')) {
      addIssue(issues, 'error', 'oracle_closing', '公開後の朝オラクルは指定の締めで終える必要があります。');
    }
  }

  if (releasePhase === 'prerelease' && /正式リリース|本リリース/.test(value)) {
    addIssue(issues, 'error', 'prerelease_false_release', 'プレリリース期間中に正式リリース済みのような表現があります。');
  }
  if (releasePhase === 'fix' && /正式リリース|本リリース/.test(value)) {
    addIssue(issues, 'error', 'fix_false_release', '修正期間中に正式リリース済みのような表現があります。');
  }

  if (kind === 'oracle' && !/今日の1枚|テーマ|よりどころ/.test(value)) {
    addIssue(issues, 'warn', 'oracle_structure', '朝オラクルとしてカード、テーマ、よりどころのどれかが弱いです。');
  }
  if (kind === 'empathy' && !/今日のルノルマン一枚/.test(value)) {
    addIssue(issues, 'error', 'lenormand_one_card_missing', 'empathy投稿には「今日のルノルマン一枚」が必要です。');
  }
  if (kind === 'empathy' && !/No\.\d{2}\s*\/\s*.+\s*\/\s*[A-Za-z]/.test(value)) {
    addIssue(issues, 'error', 'lenormand_card_line_missing', 'empathy投稿にはカード番号、日本語名、英語名が必要です。');
  }
  if (kind === 'empathy' && !/今日の兆し[\s\S]+流れのサイン/.test(value)) {
    addIssue(issues, 'error', 'lenormand_one_card_structure', 'empathy投稿には「今日の兆し」と「流れのサイン」が必要です。');
  }
  if (kind === 'empathy' && new RegExp('悩み' + '共感').test(value)) {
    addIssue(issues, 'error', 'lenormand_old_empathy_label', 'ルノルマン投稿では旧ラベルを使いません。');
  }
  if (kind === 'difference' && !/AI占い|自由記載|四柱推命|姓名判断|動物タイプ|命・卜・相|総合占術|エンジニア|本質|本音|カード|断定|整理|次に動ける/.test(value)) {
    addIssue(issues, 'warn', 'difference_axis', '羅針占術の違い紹介としての軸が弱い可能性があります。');
  }
  if (kind === 'free_paid_compare' && !/無料版|有料版|ルノルマン|数秘オラクル|鑑定履歴|深掘り/.test(value)) {
    addIssue(issues, 'warn', 'free_paid_axis', '無料版/有料版比較としての軸が弱い可能性があります。');
  }

  return { length, issues };
}

function auditImage({ draft, kind, platform }) {
  const issues = [];
  if (!SUPPORTED_PLATFORMS.has(platform)) return issues;
  const entry = draft[kind] || {};
  const imagePath = platform === 'instagram'
    ? entry.instagramImagePath
    : entry.imagePath;
  const altText = entry.altText;
  if (!imagePath) {
    addIssue(issues, 'error', `${platform}_image_missing`, `${platform}用投稿に画像パスがありません。`);
  } else if (!fs.existsSync(imagePath)) {
    addIssue(issues, 'error', `${platform}_image_not_found`, `${platform}用画像が見つかりません: ${imagePath}`);
  } else if (platform === 'instagram' && !/\.jpe?g$/i.test(imagePath)) {
    addIssue(issues, 'error', 'instagram_image_not_jpeg', `Instagram用画像はJPEGにします: ${imagePath}`);
  }
  if (!String(altText || '').trim()) {
    addIssue(issues, 'error', `${platform}_alt_missing`, `${platform}用画像のalt textがありません。`);
  }
  return issues;
}

function generateDraft(dateKey, args, item = { kind: 'all' }) {
  const kind = item.kind || 'all';
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
    `--kind=${kind}`,
    `--platforms=${args.platforms}`,
    ...(item.birthdayDays ? [`--birthday-days=${item.birthdayDays}`] : []),
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
  const seenText = new Map();

  for (const dateKey of result.dates) {
    for (const item of scheduledItemsForDate(dateKey)) {
      const kind = item.kind;
      const draft = generateDraft(dateKey, args, item);
      for (const platform of platforms) {
        const text = platform === 'instagram' ? draft[kind].instagramText : draft[kind].text;
        const trackedUrl = platform === 'instagram' ? draft[kind].instagramTrackedUrl : draft[kind].trackedUrl;
        const audit = auditText({ text, trackedUrl, dateKey, kind, platform, releaseMode: args.releaseMode });
        const imageIssues = auditImage({ draft, kind, platform });
        const repeatKey = `${kind}:${platform}:${normalizeForRepeat(text)}`;
        const repeatIssues = [];
        if (seenText.has(repeatKey)) {
          addIssue(repeatIssues, 'error', 'duplicate_text', `${platform}/${kind} の投稿文が ${seenText.get(repeatKey)} と同一です。`);
        } else {
          seenText.set(repeatKey, dateKey);
        }
        result.entries.push({
          date: dateKey,
          id: item.id || kind,
          kind,
          platform,
          releasePhase: getReleasePhase(dateKey),
          length: audit.length,
          issues: [...audit.issues, ...imageIssues, ...repeatIssues],
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
