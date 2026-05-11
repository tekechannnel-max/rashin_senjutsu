const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const threadsClient = require('./threads-client');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_JS = path.join(ROOT, 'app.js');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const STATE_FILE = path.join(OUT_DIR, 'daily-oracle-state.json');
const DEFAULT_PUBLIC_ORIGIN = 'https://rashin-senjutsu.onrender.com';
const DEFAULT_HASHTAG = '#羅針占術';
const THREADS_CHARACTER_LIMIT = 500;
const X_CHARACTER_LIMIT = 280;
const DEFAULT_SOCIAL_CAMPAIGN = '202605_prerelease';
const RELEASE_DATE = '2026-05-16';
const SOCIAL_PAID_CTA_MODES = new Set(['off', 'soft', 'active']);
const SOCIAL_RELEASE_MODES = new Set(['prelaunch', 'launch', 'postrelease']);

const NG_WORDS = [
  '絶対当たる',
  '100%当たる',
  '必ず当たる',
  '運命の人',
  '復縁できます',
  '必ず戻ってくる',
  '課金しないと',
  '買わないと悪くなる',
  'このままだと不幸',
  '手遅れ',
  '病気が治る',
  '投資で勝てる',
  '法律的に大丈夫',
  '今すぐ購入しないと',
];

const POST_CALENDAR = [
  { date: '2026-05-12', morningTheme: '焦りを分ける', eveningTheme: '先行版: 羅針占術とは', paidCta: 'none' },
  { date: '2026-05-13', morningTheme: '境界線を整える', eveningTheme: '無料鑑定で見えるもの', paidCta: 'free' },
  { date: '2026-05-14', morningTheme: '迷いを書き出す', eveningTheme: '読みっぱなしにしない占い', paidCta: 'none' },
  { date: '2026-05-15', morningTheme: '答えを急がない', eveningTheme: 'プレリリース前日案内', paidCta: 'soft_paid' },
  { date: '2026-05-16', morningTheme: '今日の一手を決める', eveningTheme: '羅針占術とは', paidCta: 'none' },
  { date: '2026-05-17', morningTheme: '小さく動く', eveningTheme: '今日のオラクルの使い方', paidCta: 'none' },
  { date: '2026-05-18', morningTheme: '週初めの整理', eveningTheme: '無料鑑定で見えるもの', paidCta: 'free' },
  { date: '2026-05-19', morningTheme: '焦りを分ける', eveningTheme: '二択にしない迷いの整理', paidCta: 'none' },
  { date: '2026-05-20', morningTheme: '本音を確認する', eveningTheme: '鑑定結果を記録する価値', paidCta: 'free' },
  { date: '2026-05-21', morningTheme: '注意点を見る', eveningTheme: '深掘り鑑定の違い', paidCta: 'soft_paid' },
  { date: '2026-05-22', morningTheme: '週末前の一手', eveningTheme: 'BOOTH購入後の流れ', paidCta: 'soft_paid' },
  { date: '2026-05-23', morningTheme: '1週間の振り返り', eveningTheme: '迷いを3行で整理する', paidCta: 'free' },
  { date: '2026-05-24', morningTheme: '休む選択', eveningTheme: '当てるより整理する占い', paidCta: 'none' },
  { date: '2026-05-25', morningTheme: '今週の軸', eveningTheme: '仕事・転職の使い方', paidCta: 'free' },
  { date: '2026-05-26', morningTheme: '距離感を整える', eveningTheme: '恋愛で断定しない理由', paidCta: 'none' },
  { date: '2026-05-27', morningTheme: 'お金の守り方', eveningTheme: '専門判断の代替にしない', paidCta: 'none' },
  { date: '2026-05-28', morningTheme: '選択肢を増やす', eveningTheme: '深掘り鑑定の利用例', paidCta: 'soft_paid' },
  { date: '2026-05-29', morningTheme: '2週間の振り返り', eveningTheme: '今日のオラクルから深掘りまでの流れ', paidCta: 'active_if_booth_ready' },
];

const PRE_RELEASE_ORACLE_PROMOS = {
  '2026-05-12': {
    intro: [
      '5/16プレリリース予定。',
      '羅針占術の「毎朝1枚」を先に届けます。',
    ],
    pitch: [
      '公開後は、今日のオラクルと無料鑑定で',
      '本質・本音・いまの現実・次の一手まで見られます。',
    ],
    closing: '5/16から、あなたも今日の1枚を引かない？',
  },
  '2026-05-13': {
    intro: [
      '5/16プレリリースまで、あと3日。',
      '今日の1枚を先行公開します。',
    ],
    pitch: [
      '羅針占術は、当てて終わりではなく、',
      '迷いを今日の小さな行動に落とす占いです。',
    ],
    closing: '5/16から、あなたも今日の1枚を引かない？',
  },
  '2026-05-14': {
    intro: [
      '5/16プレリリースまで、あと2日。',
      '無料で引ける今日のオラクルを先行公開します。',
    ],
    pitch: [
      '1枚のカードから、今日の確認点と',
      '次にできる小さな一手を見つけます。',
    ],
    closing: '5/16から、あなたも今日の1枚を引かない？',
  },
  '2026-05-15': {
    intro: [
      '明日、羅針占術をプレリリースします。',
      '今日の1枚を先にお届けします。',
    ],
    pitch: [
      '明日からは、今日のオラクルと無料鑑定で',
      '迷いを次の一手に整理できます。',
    ],
    closing: '明日から、あなたも今日の1枚を引かない？',
  },
};

const CALENDAR_CONCEPT_POSTS = {
  '先行版: 羅針占術とは': '5/16、羅針占術をプレリリースします。\n\n入口は2つ。\n毎朝の「今日のオラクル」。\n迷いを整理する「無料鑑定」。\n\n占いで不安を増やすのではなく、本質・本音・いまの現実を見て、次の一手を決めるための占いです。\n\n公開まで、先行版の今日の1枚を毎朝出します。',
  '羅針占術とは': '羅針占術は、「未来を当てる」よりも、「今の迷いを整理する」ことを大切にしています。\n\n本質。本音。いまの現実。\n\nこの3つを重ねて、次に進む方角を見つける占いです。',
  '今日のオラクルの使い方': '今日のオラクルは、読んで終わりではなく、今日の行動をひとつ決めるために使うのがおすすめです。\n\n連絡する。休む。調べる。書き出す。\n\n小さくても、次の一手が決まると迷いは少し軽くなります。',
  '無料鑑定で見えるもの': '5/16プレリリース後、無料鑑定では自分の土台、本音、いまの現実、そして次の一手を整理できます。\n\n何となく不安。\nどう動けばいいかわからない。\n考えすぎて止まっている。\n\nそんなとき、まず無料の範囲で今の状態を見るための入口です。',
  '二択にしない迷いの整理': '迷っているときは、選択肢が2つしかないように見えることがあります。\n\nやるか、やめるか。進むか、止まるか。\n\nでも本当は、「少し試す」「期限を決める」「情報を集める」という一手もあります。',
  '鑑定結果を記録する価値': '占いの結果は、その日の気分で読み捨てるだけではなく、あとから見返すことで意味が変わることがあります。\n\nあのとき何に迷っていたか。何を選んだか。今はどう感じるか。\n\n羅針占術では、鑑定を記録として残すことも大切にしています。',
  '読みっぱなしにしない占い': '羅針占術では、占いの結果を読みっぱなしにしないことを大切にします。\n\n今日の迷い。\n出たカード。\nそのあと取った行動。\n\n残しておくと、同じ悩みに見えても、少しずつ変わっていることがあります。\n\n5/16のプレリリース後、無料鑑定と履歴で流れを見返せるようにします。',
  '深掘り鑑定の違い': '無料鑑定は、今の迷いの輪郭を見るための入口です。\n\n深掘り鑑定は、その輪郭をもう少し細かく見て、止まりやすい点、見落としやすい注意点、次に確認したいことまで整理する鑑定です。',
  'BOOTH購入後の流れ': '深掘り鑑定の購入情報は、SNS上では扱いません。\n\n必要な方だけ、アプリ内で案内を確認し、BOOTH購入後に注文番号を入力して始める流れです。\n\nまずは無料鑑定で、今の迷いを整理してみてください。',
  '迷いを3行で整理する': '今週の自分に、ひとつだけ聞いてみてください。\n\n何に迷っていたか。\n何を後回しにしていたか。\n少しでも動けたことは何か。\n\n占いは、自分を責めるためではなく、流れを見直すために使ってください。',
  '当てるより整理する占い': '「悪いカードが出たから、悪い未来になる」とは読みません。\n\n注意点が見えたなら、それは怖がるためではなく、整えるためのヒントです。\n\n羅針占術は、不安を増やすより、行動を見直すきっかけにする占いです。',
  '仕事・転職の使い方': '仕事で迷うときは、「今すぐ決めること」と「まず確認すること」を分けてみてください。\n\n転職するかどうか。続けるかどうか。誰に相談するか。何を調べるか。\n\n次に確認することが決まれば、前に進めます。',
  '恋愛で断定しない理由': '恋愛占いで大切にしたいのは、相手の気持ちを決めつけることではありません。\n\n自分はどう感じているのか。どんな関係を望んでいるのか。どこで不安になっているのか。\n\n相手を見る前に、自分の本音を見てもいいと思います。',
  '専門判断の代替にしない': 'お金、健康、法律の不安が強いときほど、占いだけで判断しないことが大切です。\n\n羅針占術は、生活や気持ちを見直すきっかけにはなっても、専門判断の代わりにはなりません。',
  '深掘り鑑定の利用例': '深掘り鑑定は、強い結果を出すためのものではありません。\n\n無料鑑定で見えた流れをもとに、追加カードと追加質問で、次に確認したいことを具体化する鑑定です。\n\n必要な方だけご利用ください。',
  '今日のオラクルから深掘りまでの流れ': '今日のオラクルは入口。無料鑑定は整理。必要な方には深掘り鑑定。\n\n30日間、今日の一手を見続けると、自分が何に迷いやすいかも少し見えてきます。\n\n迷いを、次の一手に変えるために使ってください。',
  'プレリリース前日案内': '明日、羅針占術をプレリリースします。\n\nまずは無料の「今日のオラクル」から。\nもう少し整理したい方は、無料鑑定へ。\n\n深く読みたい方には、追加カード・追加質問・鑑定履歴を使う深掘り鑑定も用意しています。\n\n未来を断定するのではなく、迷いを次の一手に変えるために使ってください。',
};

const CONCEPT_POSTS = [
  '羅針占術は、カードだけで答えを決める占いではありません。姓名判断・四柱推命・動物タイプ診断で土台を見て、カードで「いまの現実」と「次の一手」を読みます。',
  '迷っているときほど、正解探しより「自分が何を大事にしたいか」を見失いやすい。羅針占術は、その軸を取り戻すための占いとして作っています。',
  '無料鑑定では、本質・本音・現実・次の一手までを読みます。深掘り鑑定では、同じ相談を追加カードと履歴の流れまで含めて細かく見ます。',
  '羅針占術で大事にしているのは、「当たった」で終わらせないこと。読み終わったあとに、今日何を確認するか、どう動くかまで残る鑑定を目指しています。',
  'カードは未来を固定するものではなく、今の状態を映す鏡として使っています。見えた流れをもとに、選び方を整えるための占いです。',
  '悩みが深いときほど、気持ちだけでも、理屈だけでも決めにくい。羅針占術では、生まれ・名前・行動傾向・カードを重ねて判断材料を増やします。',
  '「進むか、止まるか、様子を見るか」。羅針占術では、曖昧な不安をそのままにせず、次に取れる一手まで言葉にします。',
  '占いを、依存ではなく自己理解の道具にする。羅針占術は、そんな距離感で使えるWeb占いとして育てています。',
  '迷いが強いときほど、「正解」を探したくなります。でも必要なのは、誰かに決めてもらうことではなく、自分の状況を見える形にすることかもしれません。',
  '恋愛で迷うとき、相手の気持ちだけを見ようとすると、自分の本音が見えにくくなります。まずは、自分が望む距離感を整理するところから始めても大丈夫です。',
  '仕事の迷いは、「辞めるか、続けるか」だけで考えると苦しくなります。疲れ、不満、希望、確認したいことを分けるだけでも、次の一手は見えやすくなります。',
  '同じ悩みが続いているように見えても、前より早く気づけた、前より言葉にできた、前より無理をしなくなった、という変化があるかもしれません。',
  '悪いカードが出たから悪い未来になる、とは読みません。注意点が見えたなら、それは怖がるためではなく、整えるためのヒントです。',
  '深掘り鑑定は、すべての人に必要なものではありません。無料鑑定で十分なときもあります。もう少し細かく見たいときの選択肢として用意しています。',
  '羅針占術は、未来を断定するための占いではありません。迷っていることを整理して、次にできる小さな行動を見つけるための羅針盤として使ってください。',
];

function parseArgs(argv) {
  const defaultPlatforms = String(process.env.SOCIAL_PLATFORMS || 'threads')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const args = { dryRun: false, write: false, post: false, platforms: defaultPlatforms.length ? defaultPlatforms : ['threads'], kind: 'all' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--post') args.post = true;
    else if (arg === '--platforms') args.platforms = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith('--platforms=')) args.platforms = arg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--date') args.date = argv[++i];
    else if (arg.startsWith('--date=')) args.date = arg.split('=')[1];
    else if (arg === '--kind') args.kind = argv[++i] || 'all';
    else if (arg.startsWith('--kind=')) args.kind = arg.split('=')[1] || 'all';
  }
  if (!args.write && !args.post) args.dryRun = true;
  return args;
}

function normalizeMode(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function boolFromEnv(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function getSocialConfig(args) {
  const platforms = Array.isArray(args.platforms) && args.platforms.length ? args.platforms : ['threads'];
  const primaryPlatform = platforms.includes('threads') ? 'threads' : platforms[0] || 'threads';
  const boothUrl = String(process.env.BOOTH_DEEP_READING_URL || process.env.BOOTH_PRODUCT_URL || '').trim();
  const paidCtaMode = normalizeMode(process.env.SOCIAL_PAID_CTA_MODE, SOCIAL_PAID_CTA_MODES, 'soft');
  return {
    timezone: 'Asia/Tokyo',
    primaryPlatform,
    enableX: platforms.includes('x'),
    paidCtaMode,
    releaseMode: normalizeMode(process.env.SOCIAL_RELEASE_MODE, SOCIAL_RELEASE_MODES, 'prelaunch'),
    boothEnabled: boolFromEnv(process.env.SOCIAL_BOOTH_ENABLED) && !!boothUrl,
    stripeEnabled: false,
    campaign: String(process.env.SOCIAL_UTM_CAMPAIGN || DEFAULT_SOCIAL_CAMPAIGN).trim() || DEFAULT_SOCIAL_CAMPAIGN,
    defaultHashtag: DEFAULT_HASHTAG,
  };
}

function withPlatform(config, primaryPlatform) {
  return {
    ...config,
    primaryPlatform,
  };
}

function truncateText(text, maxChars) {
  const chars = [...String(text || '').trim()];
  if (chars.length <= maxChars) return chars.join('');
  return `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`;
}

function getJstDateString(date = new Date()) {
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

function getCalendarEntry(dateKey) {
  return POST_CALENDAR.find(item => item.date === dateKey) || null;
}

function isBeforeRelease(dateKey) {
  return String(dateKey || '') < RELEASE_DATE;
}

function resolvePaidCta(entry, config) {
  const requested = entry?.paidCta || 'none';
  if (requested === 'none') return 'none';
  if (requested === 'free') return 'free';
  if (config.paidCtaMode === 'off') return 'none';
  if (requested === 'active_if_booth_ready') {
    return config.paidCtaMode === 'active' && config.boothEnabled ? 'active_paid' : 'soft_paid';
  }
  if (requested === 'soft_paid') return 'soft_paid';
  return 'none';
}

function isPreReleasePosting(dateKey, config) {
  return isBeforeRelease(dateKey) && config.releaseMode === 'prelaunch';
}

function buildThreadsCtaLine(paidCta, dateKey, config) {
  if (isPreReleasePosting(dateKey, config)) {
    if (paidCta === 'free') {
      return '近日、無料の今日のオラクルと無料鑑定を案内します。';
    }
    if (paidCta === 'soft_paid' || paidCta === 'active_paid') {
      return '深掘り鑑定も準備しています。まずは無料の入口から案内します。';
    }
    return '近日、無料で今日の1枚を引けるようになります。';
  }
  if (paidCta === 'free') {
    return '今日のオラクルや無料鑑定で、今の状態を見てみてください。';
  }
  if (paidCta === 'active_paid') {
    return '深く整理したい方は、アプリ内の案内から深掘り鑑定へ進めます。';
  }
  if (paidCta === 'soft_paid') {
    return '必要な方だけ、無料鑑定のあとに深掘り鑑定を検討できる形にしています。';
  }
  return '迷いを、次の一手に変える占い。';
}

function buildXCtaLine(paidCta, dateKey, config) {
  if (isPreReleasePosting(dateKey, config)) {
    if (paidCta === 'soft_paid' || paidCta === 'active_paid') {
      return '深掘り鑑定も準備中です。まずは無料の入口から。';
    }
    return '近日、無料の今日のオラクルから。';
  }
  if (paidCta === 'free') {
    return 'まずは無料の今日のオラクルから。';
  }
  if (paidCta === 'active_paid') {
    return '深く整理したい方は、アプリ内の案内へ。';
  }
  if (paidCta === 'soft_paid') {
    return '必要な方だけ、深掘り鑑定も選べます。';
  }
  return 'まずは無料の今日のオラクルから。';
}

function buildTrackedUrl(publicOrigin, pathname = '/', params = {}) {
  const url = new URL(pathname, publicOrigin.endsWith('/') ? publicOrigin : `${publicOrigin}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function buildUtmParams(config, content) {
  return {
    utm_source: config.primaryPlatform,
    utm_medium: 'social',
    utm_campaign: config.campaign,
    utm_content: content,
  };
}

function countHashtags(text) {
  return (String(text || '').match(/(^|\s)#[^\s#]+/g) || []).length;
}

function validatePostText(text, options = {}) {
  const label = options.label || 'post';
  const value = String(text || '');
  const blocked = NG_WORDS.filter(word => value.includes(word));
  if (blocked.length) {
    throw new Error(`${label} contains blocked wording: ${blocked.join(', ')}`);
  }
  if (countHashtags(value) > 1) {
    throw new Error(`${label} must use only one hashtag.`);
  }
  if (options.platforms?.includes('threads') && [...value].length > THREADS_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for Threads: ${[...value].length}/${THREADS_CHARACTER_LIMIT}`);
  }
  if (options.platforms?.includes('x') && [...value].length > X_CHARACTER_LIMIT) {
    throw new Error(`${label} is too long for X: ${[...value].length}/${X_CHARACTER_LIMIT}`);
  }
}

function validateDraft(draft, args) {
  const platforms = Array.isArray(args.platforms) ? args.platforms : ['threads'];
  if (platforms.includes('threads')) {
    validatePostText(draft.oracle.text, { label: 'oracle Threads post', platforms: ['threads'] });
    validatePostText(draft.concept.text, { label: 'concept Threads post', platforms: ['threads'] });
  }
  if (platforms.includes('x')) {
    validatePostText(draft.oracle.xText, { label: 'oracle X post', platforms: ['x'] });
    validatePostText(draft.concept.xText, { label: 'concept X post', platforms: ['x'] });
    if (draft.oracle.xText === draft.oracle.text || draft.concept.xText === draft.concept.text) {
      throw new Error('X posts must not be identical to Threads posts.');
    }
  }
}

function scanConstInitializer(source, constName, openChar, closeChar) {
  const marker = `const ${constName}=`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${constName}`);
  const open = source.indexOf(openChar, start + marker.length);
  if (open < 0) throw new Error(`Missing ${openChar} for ${constName}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`Could not parse ${constName}`);
}

async function loadDailyOracleMessages() {
  const source = await fs.readFile(APP_JS, 'utf8');
  const literal = scanConstInitializer(source, 'DAILY_ORACLE_MESSAGES', '[', ']');
  return Function(`"use strict"; return (${literal});`)();
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function shuffle(ids) {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const bytes = crypto.randomBytes(4);
    const j = bytes.readUInt32BE(0) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function pickCard(messages, dateKey, writeState) {
  const ids = messages.map(item => item.id);
  const state = await readJson(STATE_FILE, { remaining: [], pickedByDate: {} });
  if (state.pickedByDate?.[dateKey]) {
    return messages.find(item => item.id === state.pickedByDate[dateKey]) || messages[0];
  }
  if (!Array.isArray(state.remaining) || !state.remaining.length) {
    state.remaining = shuffle(ids);
  }
  const picked = state.remaining.shift();
  state.pickedByDate = state.pickedByDate || {};
  state.pickedByDate[dateKey] = picked;
  if (writeState) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  }
  return messages.find(item => item.id === picked) || messages[0];
}

function buildOracleText(card, publicOrigin, options = {}) {
  const dateKey = options.dateKey || getJstDateString();
  const config = options.config || getSocialConfig({ platforms: ['threads'] });
  const shareUrl = buildTrackedUrl(publicOrigin, '/share/card', {
    type: 'oracle',
    id: card.id,
    ...buildUtmParams(config, `oracle_${dateKey.replace(/-/g, '')}`),
  });
  if (isPreReleasePosting(dateKey, config)) {
    const promo = PRE_RELEASE_ORACLE_PROMOS[dateKey] || PRE_RELEASE_ORACLE_PROMOS['2026-05-12'];
    return [
      '【今日の数秘オラクル・先行版】',
      '',
      ...promo.intro,
      '',
      `今日の1枚：${card.name}`,
      `テーマ：${card.title}`,
      '',
      card.share || `今日は、${card.title}を少し意識したい日。`,
      '',
      '今日の一手：',
      card.action,
      '',
      ...promo.pitch,
      '',
      shareUrl,
      '',
      config.defaultHashtag || DEFAULT_HASHTAG,
      '',
      promo.closing,
    ].join('\n');
  }
  return [
    '【今日の数秘オラクル】',
    '',
    `今日の1枚：${card.name}`,
    `テーマ：${card.title}`,
    '',
    card.share || `今日は、${card.title}を少し意識したい日。`,
    '',
    '迷っていることがあるなら、',
    'まずは「今すぐ決めること」と',
    '「もう少し見てもいいこと」を分けてみてください。',
    '',
    'カードからのメッセージ：',
    card.message,
    '',
    '今日の一手：',
    card.action,
    '',
    shareUrl,
    '',
    config.defaultHashtag || DEFAULT_HASHTAG,
    '',
    'あなたも今日の1枚を引かない？',
  ].join('\n');
}

function buildXOracleText(card, publicOrigin, options = {}) {
  const dateKey = options.dateKey || getJstDateString();
  const config = options.config || getSocialConfig({ platforms: ['x'] });
  const shareUrl = buildTrackedUrl(publicOrigin, '/share/card', {
    type: 'oracle',
    id: card.id,
    ...buildUtmParams(config, `oracle_${dateKey.replace(/-/g, '')}`),
  });
  if (isPreReleasePosting(dateKey, config)) {
    const promo = PRE_RELEASE_ORACLE_PROMOS[dateKey] || PRE_RELEASE_ORACLE_PROMOS['2026-05-12'];
    return [
      promo.intro[0],
      '',
      `先行版 今日の1枚：${card.title}`,
      card.share || `今日は、${card.title}を少し意識したい日。`,
      '',
      `今日の一手：${truncateText(card.action, 42)}`,
      '',
      promo.closing,
      shareUrl,
      config.defaultHashtag || DEFAULT_HASHTAG,
    ].join('\n');
  }
  return [
    `今日の数秘オラクル：${card.title}`,
    '',
    card.share || `今日は、${card.title}を少し意識したい日。`,
    '',
    `今日の一手：${truncateText(card.action, 42)}`,
    '',
    shareUrl,
    config.defaultHashtag || DEFAULT_HASHTAG,
  ].join('\n');
}

function buildOracleAltText(card) {
  return `数秘オラクルカード No.${card.id}「${card.name}」。テーマは「${card.title}」。`;
}

function buildConceptText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['threads'] })) {
  const entry = getCalendarEntry(dateKey);
  const paidCta = resolvePaidCta(entry, config);
  const calendarText = entry ? CALENDAR_CONCEPT_POSTS[entry.eveningTheme] : '';
  const index = crypto.createHash('sha256').update(dateKey).digest()[0] % CONCEPT_POSTS.length;
  const body = calendarText || CONCEPT_POSTS[index];
  const contentType = paidCta === 'soft_paid' || paidCta === 'active_paid'
    ? 'deep'
    : 'concept';
  const link = buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, `${contentType}_${dateKey.replace(/-/g, '')}`));
  const ctaLine = buildThreadsCtaLine(paidCta, dateKey, config);
  return [
    body,
    '',
    ctaLine,
    link,
    '',
    config.defaultHashtag || DEFAULT_HASHTAG,
  ].join('\n');
}

const X_CONCEPT_POSTS = {
  '先行版: 羅針占術とは': '羅針占術は、未来を断定する占いではありません。\n\n本質、本音、いまの現実を整理して、次の一手を見つけるための占いです。',
  '羅針占術とは': '羅針占術は、迷いを「次の一手」に変える占いです。\n\n本質、本音、いまの現実を整理します。',
  '今日のオラクルの使い方': '今日のオラクルは、読むだけで終わらせず、今日の行動をひとつ決めるために使えます。',
  '無料鑑定で見えるもの': '無料鑑定では、本質・本音・いまの現実・次の一手まで整理できます。',
  '二択にしない迷いの整理': '迷っているときは、二択に見えるものを「試す・待つ・相談する」に分けてみてください。',
  '読みっぱなしにしない占い': '占いは、読んで終わりにしなくてもいい。迷い、カード、その後の行動を残すと変化が見えます。',
  '鑑定結果を記録する価値': '前回の迷いを見返すと、同じ悩みに見えても少し変わっていることがあります。',
  '深掘り鑑定の違い': '深掘り鑑定は、無料で見えた流れを追加カードと質問で具体化する鑑定です。',
  'BOOTH購入後の流れ': '購入情報はSNSでは扱いません。必要な方だけ、アプリ内の案内からBOOTH購入と注文番号入力に進めます。',
  '迷いを3行で整理する': '今週の迷いを3行で整理するなら、何に迷ったか、何を後回しにしたか、何を少し動かせたか。',
  '当てるより整理する占い': '悪いカードが悪い未来を決めるわけではありません。注意点は、整えるためのヒントです。',
  '仕事・転職の使い方': '仕事の迷いは、今すぐ決めることと、まず確認することを分けると前に進みやすくなります。',
  '恋愛で断定しない理由': '恋愛占いで大切にしたいのは、相手の気持ちを決めつけることではなく、自分の本音を見ることです。',
  '専門判断の代替にしない': 'お金、健康、法律の不安が強いときほど、占いだけで判断しないことが大切です。',
  '深掘り鑑定の利用例': '深掘り鑑定は強い結果を出すものではなく、次に確認したいことを具体化する鑑定です。',
  '今日のオラクルから深掘りまでの流れ': '今日のオラクルは入口。無料鑑定は整理。必要な方だけ深掘りへ。',
  'プレリリース前日案内': '明日、羅針占術をプレリリースします。\n\n無料の今日のオラクルから始められます。',
};

function buildXConceptText(dateKey, publicOrigin = DEFAULT_PUBLIC_ORIGIN, config = getSocialConfig({ platforms: ['x'] })) {
  const entry = getCalendarEntry(dateKey);
  const paidCta = resolvePaidCta(entry, config);
  const fallback = CONCEPT_POSTS[crypto.createHash('sha256').update(`x:${dateKey}`).digest()[0] % CONCEPT_POSTS.length];
  const body = (entry && X_CONCEPT_POSTS[entry.eveningTheme]) || truncateText(fallback, 96);
  const contentType = paidCta === 'soft_paid' || paidCta === 'active_paid' ? 'deep' : 'concept';
  const link = buildTrackedUrl(publicOrigin, '/', buildUtmParams(config, `${contentType}_${dateKey.replace(/-/g, '')}`));
  const ctaLine = buildXCtaLine(paidCta, dateKey, config);
  return [
    body,
    '',
    ctaLine,
    link,
    config.defaultHashtag || DEFAULT_HASHTAG,
  ].join('\n');
}

async function buildDraft(args) {
  const dateKey = args.date || getJstDateString();
  const publicOrigin = (process.env.PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '');
  const config = getSocialConfig(args);
  const threadsConfig = withPlatform(config, 'threads');
  const xConfig = withPlatform(config, 'x');
  const calendar = getCalendarEntry(dateKey);
  const paidCta = resolvePaidCta(calendar, config);
  const messages = await loadDailyOracleMessages();
  const card = await pickCard(messages, dateKey, args.write || args.post);
  const imageName = `${String(card.id).padStart(2, '0')}.jpg`;
  const draft = {
    date: dateKey,
    schedule: {
      oracle: `${process.env.SOCIAL_ORACLE_TIME || '07:00'} Asia/Tokyo`,
      concept: `${process.env.SOCIAL_CONCEPT_TIME || '20:00'} Asia/Tokyo`,
    },
    oracle: {
      card,
      imagePath: path.join(ROOT, 'images', 'cards', 'oracle', imageName),
      imageUrl: `${publicOrigin}/images/cards/oracle/${imageName}`,
      altText: buildOracleAltText(card),
      text: buildOracleText(card, publicOrigin, { dateKey, config: threadsConfig }),
      xText: buildXOracleText(card, publicOrigin, { dateKey, config: xConfig }),
    },
    concept: {
      text: buildConceptText(dateKey, publicOrigin, threadsConfig),
      xText: buildXConceptText(dateKey, publicOrigin, xConfig),
    },
    meta: {
      socialConfig: {
        primaryPlatform: config.primaryPlatform,
        paidCtaMode: config.paidCtaMode,
        releaseMode: config.releaseMode,
        boothEnabled: config.boothEnabled,
        stripeEnabled: config.stripeEnabled,
        campaign: config.campaign,
      },
      calendar: calendar ? {
        morningTheme: calendar.morningTheme,
        eveningTheme: calendar.eveningTheme,
        paidCta,
      } : null,
      policy: {
        hashtag: config.defaultHashtag,
        blockedWordCount: NG_WORDS.length,
      },
    },
  };
  validateDraft(draft, args);
  if (args.write || args.post) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUT_DIR, `${dateKey}.json`), `${JSON.stringify(draft, null, 2)}\n`);
  }
  return draft;
}

function oauthEncode(value) {
  return encodeURIComponent(value).replace(/[!*()']/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildOAuthHeader(method, url, extraParams = {}) {
  const required = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing X credentials: ${missing.join(', ')}`);
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };
  const allParams = { ...extraParams, ...oauth };
  const paramString = Object.keys(allParams).sort().map(key => `${oauthEncode(key)}=${oauthEncode(allParams[key])}`).join('&');
  const base = [method.toUpperCase(), oauthEncode(url), oauthEncode(paramString)].join('&');
  const signingKey = `${oauthEncode(process.env.X_API_SECRET)}&${oauthEncode(process.env.X_ACCESS_TOKEN_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(base).digest('base64');
  return `OAuth ${Object.keys(oauth).sort().map(key => `${oauthEncode(key)}="${oauthEncode(oauth[key])}"`).join(', ')}`;
}

async function postToX(text, imagePath) {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
  const image = await fs.readFile(imagePath);
  const form = new FormData();
  form.append('media', new Blob([image], { type: 'image/jpeg' }), path.basename(imagePath));
  form.append('media_category', 'tweet_image');
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: buildOAuthHeader('POST', uploadUrl) },
    body: form,
  });
  const uploadJson = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) throw new Error(`X media upload failed: ${uploadRes.status} ${JSON.stringify(uploadJson)}`);
  const tweetUrl = 'https://api.x.com/2/tweets';
  const tweetRes = await fetch(tweetUrl, {
    method: 'POST',
    headers: {
      Authorization: buildOAuthHeader('POST', tweetUrl),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      media: { media_ids: [uploadJson.media_id_string] },
    }),
  });
  const tweetJson = await tweetRes.json().catch(() => ({}));
  if (!tweetRes.ok) throw new Error(`X post failed: ${tweetRes.status} ${JSON.stringify(tweetJson)}`);
  return tweetJson;
}

async function postTextToX(text) {
  const tweetUrl = 'https://api.x.com/2/tweets';
  const tweetRes = await fetch(tweetUrl, {
    method: 'POST',
    headers: {
      Authorization: buildOAuthHeader('POST', tweetUrl),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  const tweetJson = await tweetRes.json().catch(() => ({}));
  if (!tweetRes.ok) throw new Error(`X post failed: ${tweetRes.status} ${JSON.stringify(tweetJson)}`);
  return tweetJson;
}

async function postToThreads(text, imageUrl, altText = '') {
  return threadsClient.postImageToThreads({ text, imageUrl, altText });
}

async function postTextToThreads(text) {
  return threadsClient.postTextToThreads({ text });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const draft = await buildDraft(args);
  console.log(JSON.stringify(draft, null, 2));
  if (!args.post) return;
  const results = {};
  if (args.platforms.includes('x')) {
    if (args.kind === 'all' || args.kind === 'oracle') results.xOracle = await postToX(draft.oracle.xText, draft.oracle.imagePath);
    if (args.kind === 'all' || args.kind === 'concept') results.xConcept = await postTextToX(draft.concept.xText);
  }
  if (args.platforms.includes('threads')) {
    if (args.kind === 'all' || args.kind === 'oracle') results.threadsOracle = await postToThreads(draft.oracle.text, draft.oracle.imageUrl, draft.oracle.altText);
    if (args.kind === 'all' || args.kind === 'concept') results.threadsConcept = await postTextToThreads(draft.concept.text);
  }
  console.log(JSON.stringify({ posted: results }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
