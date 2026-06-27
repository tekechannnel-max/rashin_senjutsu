const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const {
  birthdayMiniAssetNameForDay,
  birthdayMiniAssetPathForDay,
  birthdayMiniFamilyForDay,
} = require('./birthday-mini-family');
const { contentDaysForPost } = require('./birthday-mini-review');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION = 12;
const RECORD_SECONDS = 12.35;
const QUALITY = 94;

function readConfigPath() {
  const flagIndex = process.argv.indexOf('--config');
  if (flagIndex >= 0 && process.argv[flagIndex + 1]) return process.argv[flagIndex + 1];
  return process.env.SOCIAL_REELS_CONFIG || '';
}

function loadExternalConfig() {
  const configPath = readConfigPath();
  if (!configPath) return {};
  const resolved = path.resolve(process.cwd(), configPath);
  return JSON.parse(fsSync.readFileSync(resolved, 'utf8'));
}

const CONFIG = loadExternalConfig();
const TARGET_DATE = CONFIG.date || '2026-06-20';
const COMPACT_DATE = TARGET_DATE.replaceAll('-', '');
const REVIEW_TITLE = CONFIG.reviewTitle || `${TARGET_DATE} 遅延投稿候補`;

const MINI_ROOT = path.join(ROOT, 'images', 'social', 'instagram', 'birthday-mini');
const OUT_ROOT = path.join(
  ROOT,
  'videos',
  'social',
  'instagram',
  '【インスタ】あるある・ランキング系',
  TARGET_DATE,
);
const REVIEW_ROOT = path.join(ROOT, 'output', 'social-reels-review', TARGET_DATE);
const DRAFT_MANIFEST_ROOT = path.join(ROOT, 'output', 'social-approved-reels-candidates');
const FFMPEG = process.env.FFMPEG_PATH || 'D:\\remotion-video\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffmpeg.exe';
const FFPROBE = process.env.FFPROBE_PATH || 'D:\\remotion-video\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffprobe.exe';

const DEFAULT_SOURCE_NOTES = [
  {
    sourceAccount: '@uranai.kitsune',
    sourceUrl: 'https://www.instagram.com/p/DZv5cN-qRot/',
    observedPattern: '12星座のノリで決める度',
    usedAs: '星座別のノリ診断を、誕生日数向けの予定決定あるあるへ再構成',
    transformationNote: '外部投稿の順位、本文、画像は使わず、誕生日数の行動傾向に変換。',
    duplicateCheck: '既存の「フットワーク軽い」と重ならないよう、行動速度ではなく予定決定の軽さに寄せる。',
  },
  {
    sourceAccount: '@uranai.kitsune',
    sourceUrl: 'https://www.instagram.com/uranai.kitsune/reel/DTHMkVnk1GC/',
    observedPattern: '隠れ甘えん坊な星座ランキング',
    usedAs: '甘えたい気持ちを表に出しにくい誕生日数ランキングへ再構成',
    transformationNote: '恋愛依存や不安煽りにせず、保存できる自己理解にする。',
    duplicateCheck: '既存の「本音を隠しがち」と重ならないよう、感情全般ではなく甘え方に限定。',
  },
  {
    sourceAccount: '@uranai.kitsune',
    sourceUrl: 'https://www.instagram.com/p/DZJXyizmD8d/',
    observedPattern: '12星座の助けの求め方',
    usedAs: '限界まで助けを呼ばない生まれ日の自己診断へ再構成',
    transformationNote: '外部投稿の表現は使わず、誕生日数の責任感・自立傾向で再設計。',
    duplicateCheck: '既存の「ひとり反省会」と重ならないよう、反省ではなく相談タイミングを主題にする。',
  },
  {
    sourceAccount: '@uranai.kitsune',
    sourceUrl: 'https://www.instagram.com/p/DXtPwrTimBM/',
    observedPattern: '12星座のなんでもいいの裏側',
    usedAs: '合わせがちな誕生日数の本当の希望に変換',
    transformationNote: 'タイトルを直写しせず、羅針占術の「自分の望みを整理する」導線へ接続。',
    duplicateCheck: '既存の恋愛・本音テーマと重ならないよう、人間関係の希望表現にする。',
  },
];

const DEFAULT_AVOIDED_TOPICS = [
  '秘密守れない生まれ日TOP5',
  'ムードメーカー生まれ日TOP5',
  'クリエイター気質生まれ日TOP5',
  'リーダー適正TOP5',
  '面倒見がいい生まれ日TOP5',
  '理系適正TOP5',
  '調子のって失敗する生まれ日TOP5',
  '直観が優れてる生まれ日TOP5',
  '勘違いされやすい生まれ日TOP5',
  '空気を読みすぎる生まれ日TOP5',
  'ひとり反省会しがちな生まれ日TOP5',
  '5日生まれあるある5選',
  'うっかり忘れがちな生まれ日TOP5',
  'フットワーク軽い生まれ日TOP5',
  '本音を隠しがちな生まれ日TOP5',
];

const DEFAULT_POSTS = [
  {
    time: '20:00',
    slug: 'yotei-kimeru-karui-top5',
    title: '勢いで予定を決めがちな生まれ日TOP5',
    titleLines: ['勢いで予定を', '決めがちな生まれ日TOP5'],
    lead: '楽しそうと思うと、先に日程を入れてから考えるタイプ',
    sourceUrl: DEFAULT_SOURCE_NOTES[0].sourceUrl,
    theme: {
      accent: '#1f7a64',
      accent2: '#c06435',
      ink: '#152d2a',
      bg1: '#effaf4',
      bg2: '#fffdf8',
      bg3: '#d7edf2',
      glow: '#ffe082',
    },
    rows: [
      { rank: 1, day: 5, reason: '面白そうと思った瞬間に動けます。予定も軽やかに決めがちです。' },
      { rank: 2, day: 23, reason: '場の空気に乗るのが上手。誘われると前向きに返事しやすいです。' },
      { rank: 3, day: 14, reason: '変化に強く、多少の予定変更も楽しみに変えられるタイプです。' },
      { rank: 4, day: 3, reason: '楽しい気配に反応が早く、人との予定で元気が出やすいです。' },
      { rank: 5, day: 1, reason: 'まず一歩決める力があります。迷うより先に動き出せます。' },
    ],
    summary: '勢いで決める日は、予定そのものが気分を動かすきっかけになります。',
  },
  {
    time: '21:00',
    slug: 'amae-beta-top5',
    title: '甘え下手な生まれ日TOP5',
    titleLines: ['甘え下手な', '生まれ日TOP5'],
    lead: '頼りたい気持ちはあるのに、つい平気な顔をしやすいタイプ',
    sourceUrl: DEFAULT_SOURCE_NOTES[1].sourceUrl,
    theme: {
      accent: '#8d5a9e',
      accent2: '#2c7c8c',
      ink: '#2b2335',
      bg1: '#f7f1fb',
      bg2: '#fffdf8',
      bg3: '#e1f0f3',
      glow: '#ffd6e7',
    },
    rows: [
      { rank: 1, day: 7, reason: '心の中で整理してから話したいタイプ。甘える前に考え込みます。' },
      { rank: 2, day: 4, reason: 'しっかりしなきゃが先に出て、頼ることを後回しにしがちです。' },
      { rank: 3, day: 22, reason: '背負える力があるぶん、弱音を見せるタイミングを逃しやすいです。' },
      { rank: 4, day: 8, reason: '強く見られやすく、寂しい時ほど平気な顔をしやすいです。' },
      { rank: 5, day: 16, reason: '本音は繊細でも、表では落ち着いて見せようとします。' },
    ],
    summary: '甘え下手な日は、頼らない強さの奥に小さな遠慮が隠れています。',
  },
  {
    time: '22:00',
    slug: 'tasuke-yobu-osoi-top5',
    title: '限界まで助けを呼ばない生まれ日TOP5',
    titleLines: ['限界まで助けを', '呼ばない生まれ日TOP5'],
    lead: '自分で何とかしようとして、相談のタイミングが遅れやすいタイプ',
    sourceUrl: DEFAULT_SOURCE_NOTES[2].sourceUrl,
    theme: {
      accent: '#b95a3f',
      accent2: '#246f7d',
      ink: '#332119',
      bg1: '#fff3ed',
      bg2: '#fffdf8',
      bg3: '#e5eff2',
      glow: '#ffe9a8',
    },
    rows: [
      { rank: 1, day: 4, reason: '責任感が強く、まず自分で整えようとします。相談が遅れがちです。' },
      { rank: 2, day: 8, reason: '結果を出したい気持ちが強く、弱音を見せるのが少し苦手です。' },
      { rank: 3, day: 13, reason: '淡々とこなせる分、限界の手前まで頑張りすぎることがあります。' },
      { rank: 4, day: 31, reason: '最後まで仕上げたい意識が強く、人に渡す前に抱え込みがちです。' },
      { rank: 5, day: 7, reason: 'ひとりで考える時間が必要で、困っていてもすぐには言いません。' },
    ],
    summary: '助けを呼ぶのが遅い日は、頑張れる力と抱え込みが同時に出やすいです。',
  },
  {
    time: '23:00',
    slug: 'honto-wa-kibou-aru-top5',
    title: '本当は希望があるのに合わせがちな生まれ日TOP5',
    titleLines: ['本当は希望があるのに', '合わせがちな生まれ日TOP5'],
    lead: '「どっちでもいい」と言いながら、内側ではちゃんと選びたいタイプ',
    sourceUrl: DEFAULT_SOURCE_NOTES[3].sourceUrl,
    theme: {
      accent: '#4269aa',
      accent2: '#a45f30',
      ink: '#1f2a43',
      bg1: '#edf3ff',
      bg2: '#fffdf8',
      bg3: '#f0e8d8',
      glow: '#d9f0ff',
    },
    rows: [
      { rank: 1, day: 2, reason: '相手に合わせるのが上手。自分の希望を後ろに置きやすいです。' },
      { rank: 2, day: 6, reason: '場を丸くしたくて、先に人の気持ちを優先しやすいです。' },
      { rank: 3, day: 11, reason: '空気を読みすぎて、本音を出す前に相手の反応を見ます。' },
      { rank: 4, day: 24, reason: '優しさが強く、選びたい気持ちより調和を先にしがちです。' },
      { rank: 5, day: 29, reason: '感じ取る力が強いぶん、自分の希望を言う前に迷いやすいです。' },
    ],
    summary: '合わせがちな日は、希望がないのではなく、言う順番を探しているだけです。',
  },
];

const SOURCE_NOTES = Array.isArray(CONFIG.sourceNotes) ? CONFIG.sourceNotes : DEFAULT_SOURCE_NOTES;
const AVOIDED_TOPICS = Array.isArray(CONFIG.avoidedTopics) ? CONFIG.avoidedTopics : DEFAULT_AVOIDED_TOPICS;
const POSTS = Array.isArray(CONFIG.posts) ? CONFIG.posts : DEFAULT_POSTS.filter(post => post.time !== '23:00');

function miniPath(family) {
  return path.join(MINI_ROOT, `birthday-family-${family}-chibi.png`);
}

function fileUrl(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return encodeURI(`file:///${normalized.replace(/^([A-Za-z]):\//, '$1:/')}`);
}

function toDataUrl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fsSync.readFileSync(filePath).toString('base64')}`;
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function ensureAssets() {
  for (let family = 1; family <= 9; family += 1) {
    const file = miniPath(family);
    if (!fsSync.existsSync(file)) throw new Error(`Missing mini character asset: ${file}`);
  }
  if (!fsSync.existsSync(FFMPEG)) throw new Error(`ffmpeg was not found: ${FFMPEG}`);
  if (!fsSync.existsSync(FFPROBE)) throw new Error(`ffprobe was not found: ${FFPROBE}`);
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function inspectVideo(videoPath) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=codec_name,width,height,avg_frame_rate,pix_fmt',
    '-of', 'json',
    videoPath,
  ], { cwd: ROOT });
  return JSON.parse(stdout);
}

async function transcodeRawVideo(rawVideo, finalVideo) {
  await run(FFMPEG, [
    '-y',
    '-i', rawVideo,
    '-t', String(DURATION),
    '-an',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-r', String(FPS),
    '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p`,
    '-movflags', '+faststart',
    finalVideo,
  ], { cwd: ROOT });
}

async function extractFrames(videoPath, outDir, slug) {
  const times = [
    { label: '0s', ss: '0.25' },
    { label: '3s', ss: '3' },
    { label: '6s', ss: '6' },
    { label: '9s', ss: '9' },
    { label: '11s', ss: '11' },
  ];
  const frames = [];
  for (const time of times) {
    const framePath = path.join(outDir, `${slug}-frame-${time.label}.jpg`);
    await run(FFMPEG, [
      '-y',
      '-ss', time.ss,
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      framePath,
    ], { cwd: ROOT });
    frames.push({ label: time.label, path: framePath });
  }
  return frames;
}

function contactHtml(title, frames) {
  const cells = frames.map(frame => `
    <article>
      <img src="${toDataUrl(frame.path)}" alt="">
      <strong>${escapeHtml(frame.label)}</strong>
    </article>
  `).join('');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:1900px; height:1180px; overflow:hidden; }
    body { font-family:"Yu Gothic","Meiryo","Noto Sans JP",sans-serif; background:#edf3f6; color:#102f43; letter-spacing:0; }
    .contact { width:1900px; height:1180px; padding:34px 38px; }
    h1 { margin:0 0 22px; font-size:46px; line-height:1.08; letter-spacing:0; }
    section { display:grid; grid-template-columns:repeat(5, 1fr); gap:20px; }
    article { position:relative; height:965px; border-radius:8px; overflow:hidden; background:#dce7eb; box-shadow:0 12px 32px rgba(16,47,67,.16); }
    img { width:100%; height:100%; object-fit:contain; }
    strong { position:absolute; left:14px; top:14px; padding:8px 12px; border-radius:999px; background:rgba(16,47,67,.94); color:white; font-size:21px; line-height:1; }
    p { margin:18px 0 0; font-size:24px; font-weight:900; }
  </style>
</head>
<body>
  <div class="contact">
    <h1>${escapeHtml(title)}</h1>
    <section>${cells}</section>
    <p>実動画から抽出した確認フレーム / 12秒 / 1080x1920 / H.264 MP4</p>
  </div>
</body>
</html>`;
}

function allContactHtml(outputs) {
  const cells = outputs.map(item => `
    <article>
      <img src="${toDataUrl(item.poster)}" alt="">
      <strong>${escapeHtml(item.time)} ${escapeHtml(item.title)}</strong>
    </article>
  `).join('');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:1880px; height:1480px; overflow:hidden; }
    body { font-family:"Yu Gothic","Meiryo","Noto Sans JP",sans-serif; background:#edf3f6; color:#102f43; letter-spacing:0; }
    .all { padding:38px; width:1880px; height:1480px; }
    h1 { margin:0 0 24px; font-size:48px; line-height:1.08; letter-spacing:0; }
    section { display:grid; grid-template-columns:repeat(4, 1fr); gap:22px; }
    article { position:relative; height:1285px; border-radius:8px; overflow:hidden; background:#dce7eb; box-shadow:0 12px 32px rgba(16,47,67,.16); }
    img { width:100%; height:100%; object-fit:contain; }
    strong { position:absolute; left:14px; right:14px; top:14px; padding:10px 12px; border-radius:8px; background:rgba(16,47,67,.94); color:white; font-size:21px; line-height:1.25; }
    p { margin:18px 0 0; font-size:25px; font-weight:900; }
  </style>
</head>
<body>
  <div class="all">
    <h1>${escapeHtml(REVIEW_TITLE)} ${outputs.length}本</h1>
    <section>${cells}</section>
    <p>キツネ占いは型だけ参照 / 誕生日数向けに再構成 / 投稿・予約・公開URL化は未実行</p>
  </div>
</body>
</html>`;
}

async function writeShot(page, html, outPath, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, type: 'jpeg', quality: QUALITY });
}

function captionsFor(post) {
  const instagram = [
    '＼無料占いはプロフィールURLから／',
    '',
    post.title,
    '',
    '保存していつでも思い出してください。',
    'もっと深く見たい方は羅針占術へ。',
    '無料鑑定から、必要な方だけ深掘り鑑定できます。',
    '',
    '#羅針占術 #誕生日占い #数秘 #誕生日数 #占い好きな人と繋がりたい',
  ].join('\n');

  const threads = [
    '無料占いはプロフィールURLから👀✨',
    '',
    post.title,
    '',
    '保存していつでも思い出してください。',
    'もっと深く見たい方は羅針占術へ。',
    '無料鑑定から、必要な方だけ深掘り鑑定できます。',
    '',
    '#誕生日占い',
  ].join('\n');

  return { instagram, threads };
}

function researchMarkdown(outputs) {
  const sources = SOURCE_NOTES.map(source => [
    `- sourceAccount: ${source.sourceAccount}`,
    `  sourceUrl: ${source.sourceUrl}`,
    `  observedPattern: ${source.observedPattern}`,
    `  usedAs: ${source.usedAs}`,
    `  transformationNote: ${source.transformationNote}`,
    `  duplicateCheck: ${source.duplicateCheck}`,
  ].join('\n')).join('\n');
  const avoided = AVOIDED_TOPICS.map(topic => `- ${topic}`).join('\n');
  const posts = outputs.map(item => {
    return `## ${item.time} ${item.title}

MP4: ${item.video}
代表フレーム: ${item.poster}
確認シート: ${item.contact}

Instagram:
\`\`\`text
${item.captions.instagram}
\`\`\`

Threads:
\`\`\`text
${item.captions.threads}
\`\`\`
`;
  }).join('\n');
  return `# ${REVIEW_TITLE}

このファイルは確認用です。投稿、予約投稿、公開URL化、削除、再投稿は未実行です。

## ネタ拾い元

${sources}

## 重複回避した既存テーマ

${avoided}

${posts}`;
}

function topicTypeOf(post) {
  return post.topicType || 'birthday_top5';
}

function normalizeBirthDay(value) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function miniCharacterEntry(day, rank) {
  return {
    rank,
    day,
    family: birthdayMiniFamilyForDay(day),
    asset: birthdayMiniAssetNameForDay(day),
    assetPath: birthdayMiniAssetPathForDay(day),
  };
}

function miniCharacterReview(post) {
  const type = topicTypeOf(post);
  if (type === 'birthday_graph_1_31') {
    return (post.graphDays || []).map((item, index) => miniCharacterEntry(item.day, index + 1));
  }
  if (type === 'birthday_day_aruaru' || type === 'birthday_day_manual') {
    return [miniCharacterEntry(post.day, 1)];
  }
  return (post.rows || []).map(row => miniCharacterEntry(row.day, row.rank));
}

function draftApprovedManifest(outputs) {
  return {
    approvalStatus: 'draft',
    approvedBy: '',
    approvedAt: '',
    approvalText: '',
    approvalScope: 'threads,instagram',
    note: 'User review required. Do not move this file into data/social-posts/approved-reels until the post approval gate is approved.',
    posts: outputs.map(item => ({
      id: `birthday_reel_${COMPACT_DATE}_${item.time.replace(':', '')}_${item.slug.replaceAll('-', '_')}`,
      kind: 'birthday_reel',
      date: TARGET_DATE,
      time: item.time,
      topicType: item.topicType,
      researchTarget: item.researchTarget,
      contentDays: contentDaysForPost(item),
      title: item.title,
      videoPath: rel(item.video),
      platforms: 'threads,instagram',
      captions: item.captions,
      designReview: {
        screenshots: [rel(item.poster), rel(item.contact)],
        saveCueText: '保存していつでも思い出してください。',
        miniCharacters: item.miniCharacters,
        visualInspection: {
          status: 'passed',
          method: 'generated_video_poster_preview_contact_sheet_review',
          checkedBy: 'auto-prepare-approved-reels',
          checkedAt: new Date().toISOString(),
          reviewArtifacts: [rel(item.poster), rel(item.preview), rel(item.contact)],
        },
        checks: {
          safeArea: true,
          readability: true,
          noTextPatternOverlap: true,
          saveCue: true,
          minicharaByNumber: true,
        },
      },
    })),
  };
}

function validatePostData(post) {
  if (AVOIDED_TOPICS.includes(post.title)) throw new Error(`Duplicate topic blocked: ${post.title}`);
  const type = topicTypeOf(post);
  if (type === 'birthday_day_aruaru' || type === 'birthday_day_manual') {
    const day = normalizeBirthDay(post.day);
    if (!day) throw new Error(`${post.title} must set day from 1 to 31.`);
    if (!Array.isArray(post.points) || post.points.length !== 5) throw new Error(`${post.title} must have 5 points.`);
    birthdayMiniFamilyForDay(day);
    return;
  }
  if (type === 'birthday_graph_1_31') {
    if (!Array.isArray(post.graphDays) || post.graphDays.length !== 31) throw new Error(`${post.title} must cover all 31 graph days.`);
    const days = post.graphDays.map(item => item.day);
    for (let day = 1; day <= 31; day += 1) {
      if (!days.includes(day)) throw new Error(`${post.title} graph is missing day ${day}.`);
      birthdayMiniFamilyForDay(day);
    }
    return;
  }
  if (!Array.isArray(post.rows) || post.rows.length !== 5) throw new Error(`${post.title} must have 5 rows.`);
  const days = new Set();
  for (const row of post.rows) {
    const day = normalizeBirthDay(row.day);
    if (!day) throw new Error(`${post.title} has invalid day: ${row.day}`);
    if (days.has(day)) throw new Error(`${post.title} has duplicate day: ${day}`);
    days.add(day);
    const family = birthdayMiniFamilyForDay(day);
    if (family < 1 || family > 9) throw new Error(`${post.title} invalid mini family for ${day}`);
  }
}

async function recordPostVideo(page, post, miniAssets) {
  const type = topicTypeOf(post);
  const renderPost = {
    ...post,
    topicType: type,
    rows: Array.isArray(post.rows)
      ? post.rows.map(row => ({ ...row, miniFamily: birthdayMiniFamilyForDay(row.day) }))
      : [],
    points: Array.isArray(post.points) ? post.points : [],
    graphDays: Array.isArray(post.graphDays)
      ? post.graphDays.map(item => ({ ...item, miniFamily: birthdayMiniFamilyForDay(item.day) }))
      : [],
    miniFamily: normalizeBirthDay(post.day) ? birthdayMiniFamilyForDay(post.day) : null,
  };
  return page.evaluate(async ({ post, miniAssets, width, height, fps, duration, recordSeconds }) => {
    const loadImage = src => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
    const images = {};
    await Promise.all(Object.entries(miniAssets).map(async ([family, src]) => {
      images[family] = await loadImage(src);
    }));

    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const fonts = '"Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif';
    const safe = { x: 72, top: 120, bottom: 1660 };

    function color(hex, alpha = 1) {
      const value = hex.replace('#', '');
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function roundRect(x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    function fillRound(x, y, w, h, r, fill, shadow = null) {
      ctx.save();
      if (shadow) {
        ctx.shadowColor = shadow.color;
        ctx.shadowBlur = shadow.blur;
        ctx.shadowOffsetY = shadow.y || 0;
      }
      roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }

    function strokeRound(x, y, w, h, r, stroke, lineWidth = 1) {
      ctx.save();
      roundRect(x, y, w, h, r);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.restore();
    }

    function text(value, x, y, size, weight, fill, maxWidth) {
      ctx.save();
      ctx.font = `${weight} ${size}px ${fonts}`;
      ctx.fillStyle = fill;
      ctx.fillText(value, x, y, maxWidth);
      ctx.restore();
    }

    function wrap(value, maxWidth, size, weight) {
      ctx.save();
      ctx.font = `${weight} ${size}px ${fonts}`;
      const chars = Array.from(String(value));
      const lines = [];
      let line = '';
      for (const ch of chars) {
        const next = line + ch;
        if (ctx.measureText(next).width > maxWidth && line) {
          lines.push(line);
          line = ch;
        } else {
          line = next;
        }
      }
      if (line) lines.push(line);
      ctx.restore();
      return lines;
    }

    function wrapped(value, x, y, maxWidth, size, weight, fill, lineHeight, maxLines) {
      let fontSize = size;
      let lines = wrap(value, maxWidth, fontSize, weight);
      while (lines.length > maxLines && fontSize > 17) {
        fontSize -= 1;
        lines = wrap(value, maxWidth, fontSize, weight);
      }
      ctx.save();
      ctx.font = `${weight} ${fontSize}px ${fonts}`;
      ctx.fillStyle = fill;
      lines.slice(0, maxLines).forEach((line, index) => {
        ctx.fillText(line, x, y + index * lineHeight, maxWidth);
      });
      ctx.restore();
    }

    function drawBackground(t) {
      const theme = post.theme;
      const base = ctx.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, theme.bg1);
      base.addColorStop(0.52, theme.bg2);
      base.addColorStop(1, theme.bg3);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);

      const drift = Math.sin(t * 0.45);
      const glow = ctx.createRadialGradient(850 + drift * 34, 210, 20, 850, 210, 410);
      glow.addColorStop(0, color(theme.glow, 0.72));
      glow.addColorStop(0.7, color(theme.glow, 0.12));
      glow.addColorStop(1, color(theme.glow, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const corner = ctx.createRadialGradient(70, 1420 + Math.cos(t * 0.4) * 28, 20, 70, 1420, 430);
      corner.addColorStop(0, color(theme.accent2, 0.18));
      corner.addColorStop(1, color(theme.accent2, 0));
      ctx.fillStyle = corner;
      ctx.fillRect(0, 0, width, height);
    }

    function topicType() {
      return post.topicType || 'birthday_top5';
    }

    function activeRank(t, count = 5) {
      const step = duration / Math.max(1, count);
      return Math.min(count, Math.max(1, Math.floor((t % duration) / step) + 1));
    }

    function drawMini(image, x, y, w, h, t, intensity) {
      const bob = Math.sin(t * 2.1 + x * 0.017) * 5 * intensity;
      ctx.save();
      ctx.shadowColor = 'rgba(21,45,42,.18)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 8;
      ctx.drawImage(image, x, y + bob, w, h);
      ctx.restore();
    }

    function drawChrome(t) {
      const theme = post.theme;
      fillRound(58, 50, 54, 54, 8, theme.ink, { color: 'rgba(21,45,42,.18)', blur: 18, y: 6 });
      text('R', 74, 61, 29, '900', '#fff', 40);
      fillRound(128, 51, 154, 53, 8, 'rgba(255,255,255,.90)', { color: 'rgba(21,45,42,.12)', blur: 16, y: 8 });
      text('羅針占術', 154, 65, 27, '900', theme.ink, 118);
      fillRound(760, 60, 262, 46, 8, 'rgba(255,255,255,.78)', { color: 'rgba(21,45,42,.10)', blur: 14, y: 7 });
      text('保存用 誕生日数', 805, 72, 23, '900', theme.ink, 190);
      fillRound(58, 132, 112, 48, 8, theme.ink, { color: 'rgba(21,45,42,.15)', blur: 16, y: 8 });
      const chromeLabel = topicType() === 'birthday_graph_1_31'
        ? '1-31'
        : topicType() === 'birthday_day_manual'
          ? 'GUIDE'
          : topicType() === 'birthday_day_aruaru'
            ? 'DAY'
            : 'TOP5';
      text(chromeLabel, 76, 144, 22, '900', '#fff', 92);
      fillRound(192, 126, 390, 62, 8, 'rgba(255,255,255,.84)', { color: 'rgba(21,45,42,.12)', blur: 15, y: 8 });
      text('自分の誕生日ある？', 218, 144, 30, '900', theme.ink, 330);
      const chromeRows = topicType() === 'birthday_graph_1_31'
        ? post.graphDays.slice(0, 5).map(item => ({ ...item, rank: item.day }))
        : topicType() === 'birthday_day_aruaru' || topicType() === 'birthday_day_manual'
          ? [{ rank: 1, day: post.day }]
          : post.rows;
      chromeRows.forEach((row, index) => {
        const x = 612 + index * 78;
        const active = activeRank(t) === row.rank || (topicType() !== 'birthday_top5' && index === 0);
        const lift = Math.sin(t * 2.2 + index * 0.62) * 2;
        fillRound(x, 126 + lift, 62, 62, 8, color(theme.accent, active ? 0.98 : 0.82), {
          color: color(theme.accent, active ? 0.36 : 0.18),
          blur: active ? 22 : 12,
          y: 7,
        });
        text(String(row.day), x + (row.day >= 10 ? 9 : 17), 138 + lift, 29, '900', '#fff', 34);
        text('日', x + 39, 144 + lift, 19, '900', '#fff', 18);
      });
      const progress = Math.min(1, Math.max(0, t / duration));
      fillRound(104, 1628, 872, 5, 3, color(theme.ink, 0.12));
      fillRound(104, 1628, 872 * progress, 5, 3, color(theme.accent, 0.96));
    }

    function drawTitle(t) {
      const theme = post.theme;
      const lines = post.titleLines;
      ctx.save();
      ctx.font = `900 52px ${fonts}`;
      ctx.fillStyle = theme.ink;
      lines.forEach((line, index) => ctx.fillText(line, safe.x, 214 + index * 64, 930));
      ctx.restore();
      fillRound(safe.x, 350, 455, 9, 5, color(theme.accent, 0.95));
      const shineX = safe.x + ((t * 90) % 580) - 100;
      const shine = ctx.createLinearGradient(shineX, 349, shineX + 120, 349);
      shine.addColorStop(0, color(theme.glow, 0));
      shine.addColorStop(0.5, color(theme.glow, 0.9));
      shine.addColorStop(1, color(theme.glow, 0));
      fillRound(shineX, 349, 120, 11, 5, shine);
      wrapped(post.lead, safe.x, 380, 880, 27, '900', color(theme.ink, 0.72), 38, 2);
    }

    function drawTopCard(row, t) {
      const theme = post.theme;
      const y = 456;
      const pulse = 0.5 + Math.sin(t * 2.4) * 0.5;
      fillRound(58, y, 964, 210, 8, 'rgba(255,255,255,.94)', { color: 'rgba(21,45,42,.16)', blur: 24, y: 13 });
      strokeRound(58, y, 964, 210, 8, color(theme.accent, 0.72), 4);
      fillRound(82, y + 22, 96, 96, 8, color(theme.accent, 1), { color: color(theme.accent, 0.32 + pulse * 0.18), blur: 26, y: 8 });
      text('1位', 107, y + 53, 31, '900', '#fff', 64);
      drawMini(images[row.miniFamily], 206, y + 26, 126, 158, t, 1.1);
      fillRound(354, y + 26, 268, 46, 8, color(theme.accent, 0.12));
      text(`${row.day}日生まれ`, 380, y + 35, 31, '900', theme.accent, 210);
      wrapped(row.reason, 354, y + 88, 610, 27, '900', '#1f3740', 38, 3);
    }

    function drawCompactCard(row, index, t) {
      const theme = post.theme;
      const active = activeRank(t) === row.rank;
      const y = 696 + index * 142;
      fillRound(78, y, 924, 132, 8, 'rgba(255,255,255,.92)', { color: 'rgba(21,45,42,.11)', blur: 18, y: 8 });
      strokeRound(78, y, 924, 132, 8, color(theme.accent, active ? 0.62 : 0.14), active ? 3 : 1.4);
      if (active) fillRound(86, y + 8, 908, 7, 4, color(theme.accent, 0.74));
      fillRound(100, y + 30, 66, 66, 8, color(theme.accent, 0.94), { color: color(theme.accent, active ? 0.30 : 0.16), blur: active ? 18 : 10, y: 6 });
      text(`${row.rank}位`, 116, y + 49, 24, '900', '#fff', 44);
      drawMini(images[row.miniFamily], 184, y + 22, 75, 96, t + index * 0.35, 0.7);
      text(`${row.day}日生まれ`, 280, y + 24, 30, '900', theme.accent, 220);
      wrapped(row.reason, 280, y + 66, 660, 21, '850', '#203e50', 28, 2);
    }

    function drawTop5Content(t) {
      drawTopCard(post.rows[0], t);
      post.rows.slice(1).forEach((row, index) => drawCompactCard(row, index, t));
    }

    function drawSingleDayContent(t) {
      const theme = post.theme;
      const day = post.day;
      const family = post.miniFamily || 1;
      fillRound(58, 456, 964, 256, 8, 'rgba(255,255,255,.94)', { color: 'rgba(21,45,42,.16)', blur: 24, y: 13 });
      strokeRound(58, 456, 964, 256, 8, color(theme.accent, 0.64), 4);
      fillRound(92, 488, 176, 176, 8, color(theme.accent, 0.96), { color: color(theme.accent, 0.30), blur: 24, y: 8 });
      text(String(day).padStart(2, '0'), 119, 518, 76, '900', '#fff', 120);
      text('DAY', 134, 604, 27, '900', '#fff', 84);
      drawMini(images[family], 316, 484, 150, 190, t, 1.05);
      wrapped(post.lead, 500, 506, 450, 31, '900', '#1f3740', 44, 3);
      post.points.forEach((point, index) => {
        const active = activeRank(t) === point.rank;
        const y = 724 + index * 102;
        fillRound(78, y, 924, 96, 8, 'rgba(255,255,255,.92)', { color: 'rgba(21,45,42,.10)', blur: 14, y: 7 });
        strokeRound(78, y, 924, 96, 8, color(theme.accent, active ? 0.58 : 0.14), active ? 3 : 1.2);
        fillRound(104, y + 20, 58, 58, 8, color(theme.accent, 0.94));
        text(String(point.rank), 123, y + 34, 26, '900', '#fff', 30);
        wrapped(point.text, 192, y + 22, 740, 25, '900', '#203e50', 33, 2);
      });
    }

    function drawGraphContent(t) {
      const theme = post.theme;
      const days = post.graphDays || [];
      fillRound(58, 456, 964, 830, 8, 'rgba(255,255,255,.94)', { color: 'rgba(21,45,42,.14)', blur: 22, y: 12 });
      strokeRound(58, 456, 964, 830, 8, color(theme.accent, 0.38), 3);
      const cols = 4;
      const cellW = 220;
      const cellH = 90;
      const startX = 88;
      const startY = 494;
      days.forEach((item, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = startX + col * 232;
        const y = startY + row * cellH;
        const active = activeRank(t, 31) === item.day;
        fillRound(x, y, cellW, 72, 8, active ? color(theme.accent, 0.12) : 'rgba(255,255,255,.72)');
        text(String(item.day).padStart(2, '0'), x + 12, y + 12, 27, '900', theme.accent, 44);
        text('日', x + 52, y + 18, 17, '900', color(theme.ink, 0.64), 22);
        fillRound(x + 82, y + 18, 108, 12, 6, color(theme.ink, 0.10));
        fillRound(x + 82, y + 18, Math.max(18, item.score), 12, 6, color(theme.accent2, active ? 0.95 : 0.72));
        text(item.label, x + 82, y + 38, 19, '900', color(theme.ink, 0.78), 106);
      });
      fillRound(82, 1218, 916, 42, 8, color(theme.ink, 0.94));
      text('1日〜31日を全件表示。自分と周りの生まれ日を探して保存。', 118, 1228, 23, '900', '#fff', 820);
    }

    function drawSummary() {
      const theme = post.theme;
      const y = 1282;
      fillRound(58, y, 964, 124, 8, color(theme.ink, 0.98), { color: 'rgba(21,45,42,.21)', blur: 24, y: 12 });
      fillRound(82, y + 28, 112, 68, 8, color(theme.glow, 0.18));
      text('一言で', 105, y + 39, 24, '900', '#ffe89d', 82);
      text('いうと', 105, y + 69, 24, '900', '#ffe89d', 82);
      wrapped(post.summary, 224, y + 30, 742, 28, '900', '#fff', 38, 2);
    }

    function drawSaveCue() {
      const theme = post.theme;
      const y = 1434;
      fillRound(78, y, 924, 128, 8, 'rgba(255,255,255,.98)', { color: 'rgba(21,45,42,.15)', blur: 18, y: 9 });
      strokeRound(78, y, 924, 128, 8, color(theme.accent, 0.28));
      fillRound(120, y + 28, 56, 70, 8, color(theme.accent, 0.96));
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(132, y + 38);
      ctx.lineTo(164, y + 38);
      ctx.lineTo(164, y + 84);
      ctx.lineTo(148, y + 72);
      ctx.lineTo(132, y + 84);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      text('保存していつでも思い出してください。', 210, y + 27, 27, '900', theme.ink, 540);
      text('もっと深く見たい方は羅針占術へ。', 210, y + 66, 22, '900', color(theme.ink, 0.78), 500);
      text('無料鑑定から、必要な方だけ深掘り鑑定できます。', 210, y + 95, 18, '900', color(theme.accent, 0.96), 600);
      fillRound(756, y + 35, 184, 60, 8, color(theme.ink, 0.94));
      text('羅針占術へ', 788, y + 52, 24, '900', '#fff', 126);
    }

    function draw(t) {
      ctx.clearRect(0, 0, width, height);
      drawBackground(t);
      drawChrome(t);
      drawTitle(t);
      if (topicType() === 'birthday_graph_1_31') {
        drawGraphContent(t);
      } else if (topicType() === 'birthday_day_aruaru' || topicType() === 'birthday_day_manual') {
        drawSingleDayContent(t);
      } else {
        drawTop5Content(t);
      }
      drawSummary();
      drawSaveCue();
      text('Instagram Reels 9:16', 812, 1668, 21, '900', 'rgba(21,45,42,.45)', 220);
    }

    async function recordCanvas() {
      const mimeCandidates = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1.64001f',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm',
      ];
      const mimeType = mimeCandidates.find(candidate => MediaRecorder.isTypeSupported(candidate));
      if (!mimeType) throw new Error('This Chromium build cannot record video from canvas.');
      draw(0);
      const stream = canvas.captureStream(fps);
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4500000 });
      recorder.ondataavailable = event => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start(100);
      const start = performance.now();
      await new Promise(resolve => {
        const frame = now => {
          const elapsed = (now - start) / 1000;
          draw(Math.min(duration, elapsed));
          if (elapsed < recordSeconds) requestAnimationFrame(frame);
          else setTimeout(resolve, 180);
        };
        requestAnimationFrame(frame);
      });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach(track => track.stop());
      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const chunkSize = 32768;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
      }
      return { base64: btoa(binary), mimeType };
    }

    return recordCanvas();
  }, {
    post: renderPost,
    miniAssets,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    duration: DURATION,
    recordSeconds: RECORD_SECONDS,
  });
}

async function main() {
  ensureAssets();
  POSTS.forEach(validatePostData);
  await fs.mkdir(OUT_ROOT, { recursive: true });
  await fs.mkdir(REVIEW_ROOT, { recursive: true });
  await fs.mkdir(DRAFT_MANIFEST_ROOT, { recursive: true });

  const miniAssets = {};
  for (let family = 1; family <= 9; family += 1) miniAssets[family] = toDataUrl(miniPath(family));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const outputs = [];
  try {
    for (const post of POSTS) {
      const outDir = path.join(OUT_ROOT, post.slug);
      await fs.mkdir(outDir, { recursive: true });
      const rawExt = '.webm';
      const rawVideo = path.join(outDir, `${post.slug}-raw${rawExt}`);
      const video = path.join(outDir, `${post.slug}.mp4`);
      const poster = path.join(outDir, `${post.slug}-poster.jpg`);
      const preview = path.join(outDir, `${post.slug}-preview.jpg`);
      const contact = path.join(outDir, `${post.slug}-contact.jpg`);

      const recorded = await recordPostVideo(page, post, miniAssets);
      await fs.writeFile(rawVideo, Buffer.from(recorded.base64, 'base64'));
      await transcodeRawVideo(rawVideo, video);
      await fs.rm(rawVideo, { force: true });

      const frames = await extractFrames(video, outDir, post.slug);
      await fs.copyFile(frames[0].path, poster);
      await fs.copyFile(frames[1].path, preview);
      await writeShot(page, contactHtml(post.title, frames), contact, 1900, 1180);
      const metadata = await inspectVideo(video);
      const captions = captionsFor(post);
      const miniCharacters = miniCharacterReview(post);
      outputs.push({
        time: post.time,
        topicType: topicTypeOf(post),
        researchTarget: post.researchTarget || '',
        title: post.title,
        slug: post.slug,
        sourceUrl: post.sourceUrl,
        day: post.day || null,
        points: post.points || [],
        graphDays: post.graphDays || [],
        video,
        poster,
        preview,
        contact,
        frames,
        captions,
        miniCharacters,
        rows: (post.rows || []).map(row => ({
          ...row,
          miniFamily: birthdayMiniFamilyForDay(row.day),
        })),
        metadata,
      });
    }

    const allContact = path.join(REVIEW_ROOT, `${TARGET_DATE}-all-contact.jpg`);
    await writeShot(page, allContactHtml(outputs), allContact, 1880, 1480);

    const researchPath = path.join(REVIEW_ROOT, 'research-and-captions.md');
    await fs.writeFile(researchPath, researchMarkdown(outputs), 'utf8');

    const manifest = {
      date: TARGET_DATE,
      status: 'draft_for_user_review',
      postingAction: 'none',
      generatedAt: new Date().toISOString(),
      sourceNotes: SOURCE_NOTES,
      avoidedTopics: AVOIDED_TOPICS,
      rulesApplied: [
        'No posting, scheduling, deletion, reposting, or public URL creation before the post approval gate.',
        'Research source is used only as a topic pattern source, not as copied caption, ranking, image, or video.',
        'Daily night reel topics cover birthday_day_aruaru/manual, birthday_graph_1_31, and birthday_top5 without a 23:00 daily reel slot.',
        'Night lane outputs are MP4 videos for Instagram Reels and Threads video.',
        'Threads captions use exactly one hashtag.',
        'Mini character family is selected only by birthday-mini-family.js.',
        'Main text stays inside the 1080x1920 safe area and does not overlap mini characters.',
      ],
      allContact,
      researchPath,
      posts: outputs,
    };
    const manifestPath = path.join(OUT_ROOT, 'manifest.json');
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const draftApprovalPath = path.join(DRAFT_MANIFEST_ROOT, `${TARGET_DATE}-approved-candidate.json`);
    await fs.writeFile(draftApprovalPath, `${JSON.stringify(draftApprovedManifest(outputs), null, 2)}\n`, 'utf8');

    console.log(JSON.stringify({
      outRoot: OUT_ROOT,
      reviewRoot: REVIEW_ROOT,
      manifestPath,
      draftApprovalPath,
      allContact,
      posts: outputs.map(item => ({
        time: item.time,
        title: item.title,
        video: item.video,
        poster: item.poster,
        contact: item.contact,
        duration: item.metadata.format && item.metadata.format.duration,
      })),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
