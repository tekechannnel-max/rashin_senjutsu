const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { birthdayMiniFamilyForDay } = require('./birthday-mini-family');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1920;
const VIDEO_SECONDS = 12;
const FPS = 30;
const QUALITY = 92;

const INSTAGRAM_ROOT = path.join(ROOT, 'images', 'social', 'instagram');
const MINI_ROOT = path.join(INSTAGRAM_ROOT, 'birthday-mini');
const OUT_ROOT = path.join(
  ROOT,
  'videos',
  'social',
  'instagram',
  '【インスタ】あるある・ランキング系',
  '2026-06-14',
);
const FFMPEG = process.env.FFMPEG_PATH || 'D:\\remotion-video\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffmpeg.exe';
const FFPROBE = process.env.FFPROBE_PATH || 'D:\\remotion-video\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffprobe.exe';

const DATA_URL_CACHE = new Map();

const POSTS = [
  {
    slug: 'koui-donkan-top5',
    label: '保存用',
    title: '好意に鈍感レベルTOP5',
    theme: 'blue',
    accent: '#1f6fb2',
    rows: [
      {
        rank: 1,
        day: 7,
        reason: '数秘7は分析・内面・マイワールドの数字です。好意を向けられても「ただ親切なだけでは？」と考えすぎます。',
      },
      {
        rank: 2,
        day: 16,
        reason: '1＋6＝7。人の感情を読むより、真意を疑いやすいタイプです。わかりやすく言われないと気づきにくいです。',
      },
      {
        rank: 3,
        day: 25,
        reason: '2＋5＝7。感覚は鋭いのに、恋愛になると急に受け取り方が慎重になります。好意をスルーしがちです。',
      },
      {
        rank: 4,
        day: 4,
        reason: '数秘4は現実的です。遠回しなアピールより、はっきり言われないと「そういう意味」と受け取りません。',
      },
      {
        rank: 5,
        day: 8,
        reason: '目標や結果に意識が向きやすく、恋愛の細かいサインを見落としがちです。好意より用件を優先しやすいです。',
      },
    ],
    summary: '好意に鈍感なのは、7系の考えすぎと4・8系の現実重視が強いです。',
  },
  {
    slug: 'menhera-nariyasui-top5',
    label: '占いエンタメ',
    title: 'メンヘラになりやすい生まれ日TOP5',
    theme: 'rose',
    accent: '#c24d72',
    caution: '※医学的な意味ではなく、占いエンタメとしての恋愛で不安定になりやすい・感情が揺れやすい傾向です。',
    rows: [
      {
        rank: 1,
        day: 29,
        reason: '2＋9＝11。感受性と直感が強く、相手の態度の小さな変化で一気に不安になりやすいです。',
      },
      {
        rank: 2,
        day: 11,
        reason: 'マスターナンバー11で、感情や空気を拾いすぎます。返信速度や言葉の温度差にかなり敏感です。',
      },
      {
        rank: 3,
        day: 2,
        reason: '数秘2は共感・依存・繊細さの数字です。好きな人の反応に気持ちが左右されやすいです。',
      },
      {
        rank: 4,
        day: 15,
        reason: '1＋5＝6。愛されたい気持ちが強く、寂しさが出ると相手に確認したくなりやすいです。',
      },
      {
        rank: 5,
        day: 6,
        reason: '数秘6は愛情深いぶん、恋愛に入れ込みやすいです。尽くしすぎて不安を抱えやすいタイプです。',
      },
    ],
    summary: 'メンヘラ化しやすいのは、2系の不安感・6系の愛情過多・11系の感受性が強い生まれ日です。',
  },
  {
    slug: 'natsuyasumi-shukudai-hayai-top5',
    label: '保存用',
    title: '夏休みの宿題はやく終わる生まれ日TOP5',
    theme: 'green',
    accent: '#2b8a66',
    rows: [
      {
        rank: 1,
        day: 4,
        reason: '数秘4は計画・努力・管理の数字です。コツコツ進めて、気づいたら早めに終わらせています。',
      },
      {
        rank: 2,
        day: 13,
        reason: '1＋3＝4。やるべきことを後回しにするのが落ち着かないタイプです。意外と真面目に片づけます。',
      },
      {
        rank: 3,
        day: 22,
        reason: '2＋2＝4、かつマスターナンバー。大きな課題でも計画を立てて現実的に処理できます。',
      },
      {
        rank: 4,
        day: 31,
        reason: '3＋1＝4。遊びたい気持ちはあっても、最後はちゃんと仕上げます。早めに終わらせて安心したいタイプです。',
      },
      {
        rank: 5,
        day: 8,
        reason: '数秘8は成果主義です。「終わらせた」という達成感を取りに行くタイプです。やるなら一気に片づけます。',
      },
    ],
    summary: '宿題が早いのは、4系の計画性と8系の達成欲です。',
  },
];

function familyOf(day) {
  return birthdayMiniFamilyForDay(day);
}

function miniPath(family) {
  return path.join(MINI_ROOT, `birthday-family-${family}-chibi.png`);
}

function fileUrl(filePath) {
  if (DATA_URL_CACHE.has(filePath)) return DATA_URL_CACHE.get(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${fsSync.readFileSync(filePath).toString('base64')}`;
  DATA_URL_CACHE.set(filePath, dataUrl);
  return dataUrl;
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureAssets() {
  const required = Array.from({ length: 9 }, (_, index) => miniPath(index + 1));
  const missing = required.filter((file) => !fsSync.existsSync(file));
  if (missing.length) throw new Error(`Missing mini character assets:\n${missing.join('\n')}`);
  if (!fsSync.existsSync(FFMPEG)) throw new Error(`ffmpeg was not found: ${FFMPEG}`);
  if (!fsSync.existsSync(FFPROBE)) throw new Error(`ffprobe was not found: ${FFPROBE}`);
}

function baseHtml(body, extraCss = '') {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    body { font-family: "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif; color: #173647; }
    .stage { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #f7fbff; }
    .bg { position:absolute; inset:0; }
    .theme-blue {
      background:
        radial-gradient(circle at 82% 12%, rgba(255, 233, 150, .85), transparent 190px),
        radial-gradient(circle at 8% 76%, rgba(102, 196, 194, .36), transparent 320px),
        linear-gradient(145deg, #e8f7ff 0%, #ffffff 42%, #c6dff2 100%);
    }
    .theme-rose {
      background:
        radial-gradient(circle at 84% 15%, rgba(255, 217, 229, .95), transparent 220px),
        radial-gradient(circle at 8% 80%, rgba(120, 196, 204, .34), transparent 330px),
        linear-gradient(145deg, #fff2f5 0%, #ffffff 44%, #d9e9fa 100%);
    }
    .theme-green {
      background:
        radial-gradient(circle at 84% 14%, rgba(255, 226, 109, .86), transparent 210px),
        radial-gradient(circle at 7% 78%, rgba(96, 186, 151, .38), transparent 330px),
        linear-gradient(145deg, #edf9ef 0%, #ffffff 46%, #d8ecff 100%);
    }
    .bg::before { content:""; position:absolute; right:-190px; top:-150px; width:560px; height:560px; border-radius:50%; background:rgba(255,255,255,.52); border:3px solid rgba(255,255,255,.7); }
    .bg::after { content:""; position:absolute; left:-130px; bottom:-170px; width:480px; height:480px; border-radius:50%; background:rgba(255,255,255,.44); border:3px solid rgba(255,255,255,.65); }
    .grain { position:absolute; inset:0; opacity:.18; background-image: radial-gradient(rgba(20,50,70,.17) 1px, transparent 1px); background-size:18px 18px; }
    .brand { position:absolute; left:58px; top:52px; display:flex; align-items:center; gap:14px; font-size:27px; line-height:1; font-weight:1000; color:#173647; }
    .mark { display:grid; place-items:center; width:52px; height:52px; border-radius:12px; background:#173647; color:white; letter-spacing:0; }
    .brand span { display:block; padding:14px 20px; border-radius:999px; background:rgba(255,255,255,.86); box-shadow:0 12px 30px rgba(17,50,67,.13); }
    main { position:absolute; left:58px; right:58px; top:130px; bottom:54px; }
    .topline { display:flex; align-items:center; justify-content:space-between; gap:18px; margin-bottom:18px; }
    .pill { display:inline-flex; align-items:center; min-height:48px; padding:10px 18px; border-radius:999px; background:#173647; color:#fff; font-size:25px; line-height:1; font-weight:1000; box-shadow:0 12px 28px rgba(17,50,67,.22); }
    .hook { display:inline-flex; align-items:center; min-height:48px; padding:10px 18px; border-radius:999px; background:rgba(255,255,255,.92); color:#173647; font-size:24px; line-height:1; font-weight:1000; box-shadow:0 12px 28px rgba(17,50,67,.11); }
    h1 { margin:0; width:930px; color:#173647; font-size:58px; line-height:1.12; letter-spacing:0; font-weight:1000; text-wrap:balance; }
    .caution { margin:14px 0 14px; padding:12px 16px; border-radius:12px; background:rgba(255,255,255,.88); color:#315567; font-size:22px; line-height:1.35; font-weight:850; border:1px solid rgba(23,54,71,.12); }
    section { display:grid; gap:13px; margin-top:20px; }
    .card { display:grid; grid-template-columns:88px 96px 1fr; align-items:center; gap:16px; min-height:190px; padding:14px 18px 14px 16px; border-radius:14px; background:rgba(255,255,255,.91); border:1px solid rgba(23,54,71,.11); box-shadow:0 14px 34px rgba(17,50,67,.13); }
    .rank { display:grid; place-items:center; width:78px; height:78px; border-radius:20px; background:var(--accent); color:#fff; font-size:31px; line-height:1; font-weight:1000; box-shadow:0 10px 22px rgba(17,50,67,.18); }
    .mini { width:92px; height:128px; object-fit:contain; filter:drop-shadow(0 8px 11px rgba(17,50,67,.18)); }
    .day { margin:0 0 6px; color:var(--accent); font-size:31px; line-height:1.05; font-weight:1000; }
    .reason { margin:0; color:#213f50; font-size:25px; line-height:1.34; font-weight:850; letter-spacing:0; }
    .summary { position:absolute; left:0; right:0; bottom:0; display:grid; grid-template-columns:154px 1fr; gap:18px; align-items:center; min-height:154px; padding:22px 26px; border-radius:20px; background:#173647; color:#fff; box-shadow:0 18px 42px rgba(17,50,67,.22); }
    .summary strong { display:block; color:#ffe7a3; font-size:28px; line-height:1.1; font-weight:1000; }
    .summary p { margin:0; font-size:30px; line-height:1.33; font-weight:1000; letter-spacing:0; }
    .footer { position:absolute; right:58px; bottom:25px; color:rgba(23,54,71,.56); font-size:20px; font-weight:900; }
    ${extraCss}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function postHtml(post) {
  const cardRows = post.rows.map((row) => {
    const family = familyOf(row.day);
    return `
      <article class="card">
        <div class="rank">${row.rank}位</div>
        <img class="mini" src="${fileUrl(miniPath(family))}" alt="">
        <div>
          <h2 class="day">${row.day}日生まれ</h2>
          <p class="reason">${esc(row.reason)}</p>
        </div>
      </article>`;
  }).join('');
  return baseHtml(`
    <div class="stage" style="--accent:${post.accent}">
      <div class="bg theme-${post.theme}"></div>
      <div class="grain"></div>
      <div class="brand"><div class="mark">R</div><span>羅針占術</span></div>
      <main>
        <div class="topline">
          <div class="pill">${esc(post.label)}</div>
          <div class="hook">誕生日数 × 数秘</div>
        </div>
        <h1>${esc(post.title)}</h1>
        ${post.caution ? `<p class="caution">${esc(post.caution)}</p>` : ''}
        <section>${cardRows}</section>
        <div class="summary">
          <strong>一言で<br>いうと</strong>
          <p>${esc(post.summary)}</p>
        </div>
      </main>
      <div class="footer">Instagram / Threads 9:16</div>
    </div>`, post.caution ? `
    section { gap:10px; margin-top:14px; }
    .card { min-height:174px; padding-top:12px; padding-bottom:12px; }
    .reason { font-size:23px; line-height:1.31; }
    .summary { min-height:142px; padding-top:18px; padding-bottom:18px; }
    .summary p { font-size:28px; line-height:1.28; }
  ` : '');
}

function contactHtml(title, frames) {
  const cells = frames.map((frame) => `
    <article>
      <img src="${fileUrl(frame.path)}" alt="">
      <strong>${frame.label}</strong>
    </article>
  `).join('');
  return baseHtml(`
    <div class="contact">
      <h1>${esc(title)}</h1>
      <section>${cells}</section>
      <p>画像切り替えなし / 12秒 / 1080x1920 / H.264 MP4</p>
    </div>
  `, `
    html, body { width: 1600px; height: 1200px; }
    .contact { width:1600px; height:1200px; background:#f2f6f8; padding:38px; color:#173647; }
    .contact h1 { width:auto; margin:0 0 24px; font-size:46px; }
    .contact section { display:grid; grid-template-columns:repeat(4, 1fr); gap:22px; margin:0; }
    .contact article { position:relative; height:980px; overflow:hidden; border-radius:10px; background:#e7eef2; box-shadow:0 12px 30px rgba(17,50,67,.16); }
    .contact img { width:100%; height:100%; object-fit:contain; }
    .contact strong { position:absolute; left:14px; top:14px; padding:8px 12px; border-radius:999px; background:rgba(23,54,71,.92); color:#fff; font-size:20px; }
    .contact p { margin:18px 0 0; font-size:24px; font-weight:900; }
  `);
}

function allContactHtml(items) {
  const cards = items.map((item) => `
    <article>
      <img src="${fileUrl(item.poster)}" alt="">
      <strong>${esc(item.title)}</strong>
    </article>
  `).join('');
  return baseHtml(`
    <div class="all-contact">
      <h1>投稿用静止レイアウト動画 3本</h1>
      <section>${cards}</section>
      <p>すべて画像切り替えなし / Instagram・Threads共用 9:16 MP4</p>
    </div>
  `, `
    html, body { width: 1800px; height: 1200px; }
    .all-contact { width:1800px; height:1200px; background:#f2f6f8; padding:38px; color:#173647; }
    .all-contact h1 { width:auto; margin:0 0 24px; font-size:48px; }
    .all-contact section { display:grid; grid-template-columns:repeat(3, 1fr); gap:26px; margin:0; }
    .all-contact article { position:relative; height:980px; overflow:hidden; border-radius:10px; background:#e7eef2; box-shadow:0 12px 30px rgba(17,50,67,.16); }
    .all-contact img { width:100%; height:100%; object-fit:contain; }
    .all-contact strong { position:absolute; left:16px; right:16px; top:16px; padding:12px 14px; border-radius:12px; background:rgba(23,54,71,.92); color:#fff; font-size:24px; line-height:1.25; }
    .all-contact p { margin:18px 0 0; font-size:25px; font-weight:900; }
  `);
}

async function writeShot(page, html, outPath, width = WIDTH, height = HEIGHT) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, type: 'jpeg', quality: QUALITY });
  return outPath;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(command)} exited with ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function encodeStaticMp4(poster, video) {
  await run(FFMPEG, [
    '-y',
    '-loop', '1',
    '-framerate', String(FPS),
    '-i', poster,
    '-t', String(VIDEO_SECONDS),
    '-an',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`,
    '-color_range', 'tv',
    '-movflags', '+faststart',
    video,
  ], { cwd: ROOT });
}

async function extractVideoFrames(video, outDir, slug) {
  const times = [
    { label: '0秒', ss: '0.2' },
    { label: '4秒', ss: '4' },
    { label: '8秒', ss: '8' },
    { label: '11秒', ss: '11' },
  ];
  const frames = [];
  for (const time of times) {
    const framePath = path.join(outDir, `${slug}-frame-${time.label.replace('秒', 's')}.jpg`);
    await run(FFMPEG, [
      '-y',
      '-ss', time.ss,
      '-i', video,
      '-frames:v', '1',
      '-q:v', '2',
      framePath,
    ], { cwd: ROOT });
    frames.push({ label: time.label, path: framePath });
  }
  return frames;
}

async function inspectVideo(video) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_name,width,height,avg_frame_rate,pix_fmt',
    '-of', 'json',
    video,
  ], { cwd: ROOT });
  return JSON.parse(stdout);
}

async function main() {
  ensureAssets();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const outputs = [];
  try {
    for (const post of POSTS) {
      const outDir = path.join(OUT_ROOT, post.slug);
      const poster = path.join(outDir, `${post.slug}-poster.jpg`);
      const preview = path.join(outDir, `${post.slug}-preview.jpg`);
      const contact = path.join(outDir, `${post.slug}-contact.jpg`);
      const video = path.join(outDir, `${post.slug}-static.mp4`);
      const html = postHtml(post);
      await writeShot(page, html, poster);
      await encodeStaticMp4(poster, video);
      const frames = await extractVideoFrames(video, outDir, post.slug);
      await fs.copyFile(frames[0].path, preview);
      await writeShot(page, contactHtml(post.title, frames), contact, 1600, 1200);
      const metadata = await inspectVideo(video);
      outputs.push({ title: post.title, slug: post.slug, poster, preview, contact, video, frames, metadata });
    }
    const allContact = path.join(OUT_ROOT, '2026-06-14-static-top5-contact.jpg');
    await writeShot(page, allContactHtml(outputs), allContact, 1800, 1200);
    outputs.push({ title: 'all-contact', contact: allContact });
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(outputs, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
