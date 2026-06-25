const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { birthdayMiniFamilyForDay } = require('./birthday-mini-family');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION = 12;
const RECORD_SECONDS = 12.45;
const QUALITY = 94;

const INSTAGRAM_ROOT = path.join(ROOT, 'images', 'social', 'instagram');
const MINI_ROOT = path.join(INSTAGRAM_ROOT, 'birthday-mini');
const OUT_ROOT = path.join(
  ROOT,
  'videos',
  'social',
  'instagram',
  '【インスタ】あるある・ランキング系',
  '2026-06-14-designed-v4',
);
const FFMPEG = process.env.FFMPEG_PATH || 'D:\\remotion-video\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffmpeg.exe';
const FFPROBE = process.env.FFPROBE_PATH || 'D:\\remotion-video\\node_modules\\@remotion\\compositor-win32-x64-msvc\\ffprobe.exe';

const DATA_URL_CACHE = new Map();
const CTA_PRIMARY = '保存していつでも思い出してください';
const CTA_SECONDARY = 'もっと深く見たい方は羅針占術へ';
const CTA_BADGE = '無料鑑定から、必要な方だけ深掘り鑑定';

const POSTS = [
  {
    slug: 'koui-donkan-top5',
    title: '好意に鈍感レベルTOP5',
    titleLines: ['好意に鈍感レベルTOP5'],
    kicker: '保存用',
    theme: {
      name: 'analysis',
      accent: '#1d70b8',
      accent2: '#45b7bc',
      ink: '#102f43',
      bg1: '#eaf8ff',
      bg2: '#fdfefe',
      bg3: '#cfe6f6',
      glow: '#ffe391',
    },
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
    title: 'メンヘラになりやすい生まれ日TOP5',
    titleLines: ['メンヘラになりやすい', '生まれ日TOP5'],
    kicker: '占いエンタメ',
    caution: '※医学的な意味ではなく、占いエンタメとしての恋愛で不安定になりやすい・感情が揺れやすい傾向です。',
    theme: {
      name: 'sensitive',
      accent: '#bf426d',
      accent2: '#47a9b2',
      ink: '#122f42',
      bg1: '#fff1f6',
      bg2: '#fefeff',
      bg3: '#dceffc',
      glow: '#ffd9e7',
    },
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
    title: '夏休みの宿題はやく終わる生まれ日TOP5',
    titleLines: ['夏休みの宿題はやく', '終わる生まれ日TOP5'],
    kicker: '保存用',
    theme: {
      name: 'summer',
      accent: '#238967',
      accent2: '#e3a62f',
      ink: '#102f43',
      bg1: '#edfbef',
      bg2: '#fefefe',
      bg3: '#d7ecff',
      glow: '#ffdd70',
    },
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

function ensureAssets() {
  const required = Array.from({ length: 9 }, (_, index) => miniPath(index + 1));
  const missing = required.filter((file) => !fsSync.existsSync(file));
  if (missing.length) throw new Error(`Missing mini character assets:\n${missing.join('\n')}`);
  if (!fsSync.existsSync(FFMPEG)) throw new Error(`ffmpeg was not found: ${FFMPEG}`);
  if (!fsSync.existsSync(FFPROBE)) throw new Error(`ffprobe was not found: ${FFPROBE}`);
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

function concatListLine(filePath) {
  return `file '${filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
}

async function inspectVideo(video) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration,size:stream=codec_name,width,height,avg_frame_rate,pix_fmt',
    '-of', 'json',
    video,
  ], { cwd: ROOT });
  return JSON.parse(stdout);
}

async function transcodeRawVideo(rawVideo, finalVideo) {
  const parsed = path.parse(finalVideo);
  const tempBase = path.join(parsed.dir, `${parsed.name}-base.mp4`);
  const tempFrame = path.join(parsed.dir, `${parsed.name}-tail.jpg`);
  const tempPad = path.join(parsed.dir, `${parsed.name}-pad.mp4`);
  const tempList = path.join(parsed.dir, `${parsed.name}-concat.txt`);
  const tempConcat = path.join(parsed.dir, `${parsed.name}-concat.mp4`);

  try {
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
      tempBase,
    ], { cwd: ROOT });

    await run(FFMPEG, [
      '-y',
      '-sseof', '-0.05',
      '-i', tempBase,
      '-frames:v', '1',
      '-q:v', '2',
      tempFrame,
    ], { cwd: ROOT });

    await run(FFMPEG, [
      '-y',
      '-loop', '1',
      '-framerate', String(FPS),
      '-i', tempFrame,
      '-t', '1',
      '-an',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p`,
      '-movflags', '+faststart',
      tempPad,
    ], { cwd: ROOT });

    await fs.writeFile(tempList, `${concatListLine(tempBase)}\n${concatListLine(tempPad)}\n`, 'utf8');

    await run(FFMPEG, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', tempList,
      '-c', 'copy',
      tempConcat,
    ], { cwd: ROOT });

    await run(FFMPEG, [
      '-y',
      '-i', tempConcat,
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
  } finally {
    await Promise.all([tempBase, tempFrame, tempPad, tempList, tempConcat].map((file) => fs.rm(file, { force: true })));
  }
}

async function extractVideoFrames(video, outDir, slug) {
  const times = [
    { label: '0秒', ss: '0.25' },
    { label: '3秒', ss: '3' },
    { label: '6秒', ss: '6' },
    { label: '9秒', ss: '9' },
    { label: '11秒', ss: '11' },
  ];
  const frames = [];
  for (const time of times) {
    const framePath = path.join(outDir, `${slug}-designed-frame-${time.label.replace('秒', 's')}.jpg`);
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

function contactHtml(title, frames) {
  const cells = frames.map((frame) => `
    <article>
      <img src="${fileUrl(frame.path)}" alt="">
      <strong>${frame.label}</strong>
    </article>
  `).join('');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:1900px; height:1180px; overflow:hidden; }
    body { font-family:"Yu Gothic","Meiryo","Noto Sans JP",sans-serif; background:#edf3f6; color:#102f43; }
    .contact { width:1900px; height:1180px; padding:34px 38px; }
    h1 { margin:0 0 22px; font-size:46px; line-height:1.08; letter-spacing:0; }
    section { display:grid; grid-template-columns:repeat(5, 1fr); gap:20px; }
    article { position:relative; height:965px; border-radius:12px; overflow:hidden; background:#dce7eb; box-shadow:0 12px 32px rgba(16,47,67,.16); }
    img { width:100%; height:100%; object-fit:contain; }
    strong { position:absolute; left:14px; top:14px; padding:8px 12px; border-radius:999px; background:rgba(16,47,67,.94); color:white; font-size:21px; line-height:1; }
    p { margin:18px 0 0; font-size:24px; font-weight:900; }
  </style>
</head>
<body>
  <div class="contact">
    <h1>${escapeHtml(title)}</h1>
    <section>${cells}</section>
    <p>画像切り替えなし / 12秒 / 1080x1920 / H.264 MP4 / 実動画から抽出した確認フレーム</p>
  </div>
</body>
</html>`;
}

function allContactHtml(items) {
  const cells = items.map((item) => `
    <article>
      <img src="${fileUrl(item.poster)}" alt="">
      <strong>${escapeHtml(item.title)}</strong>
    </article>
  `).join('');
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; width:1800px; height:1200px; overflow:hidden; }
    body { font-family:"Yu Gothic","Meiryo","Noto Sans JP",sans-serif; background:#edf3f6; color:#102f43; }
    .all { padding:38px; width:1800px; height:1200px; }
    h1 { margin:0 0 24px; font-size:48px; line-height:1.08; letter-spacing:0; }
    section { display:grid; grid-template-columns:repeat(3, 1fr); gap:26px; }
    article { position:relative; height:982px; border-radius:12px; overflow:hidden; background:#dce7eb; box-shadow:0 12px 32px rgba(16,47,67,.16); }
    img { width:100%; height:100%; object-fit:contain; }
    strong { position:absolute; left:16px; right:16px; top:16px; padding:12px 14px; border-radius:12px; background:rgba(16,47,67,.94); color:white; font-size:24px; line-height:1.25; }
    p { margin:18px 0 0; font-size:25px; font-weight:900; }
  </style>
</head>
<body>
  <div class="all">
    <h1>投稿用デザイン強化版動画 3本</h1>
    <section>${cells}</section>
    <p>すべて画像切り替えなし / 装飾は文字領域に重ねない / 保存CTAと羅針占術導線を画面内に固定</p>
  </div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function writeShot(page, html, outPath, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, type: 'jpeg', quality: QUALITY });
}

async function recordDesignedVideo(page, post, miniAssets) {
  const renderPost = {
    ...post,
    rows: post.rows.map(row => ({
      ...row,
      miniFamily: familyOf(row.day),
    })),
  };
  return page.evaluate(async ({ post, miniAssets, width, height, fps, duration, recordSeconds, ctaPrimary, ctaSecondary, ctaBadge }) => {
    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

    const images = {};
    await Promise.all(Object.entries(miniAssets).map(async ([family, src]) => {
      images[family] = await loadImage(src);
    }));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    document.body.innerHTML = '';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const fonts = {
      title: '"Yu Gothic", "Meiryo", sans-serif',
      body: '"Yu Gothic", "Meiryo", sans-serif',
    };

    function color(hex, alpha = 1) {
      const value = hex.replace('#', '');
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function miniFamilyOfRow(row) {
      const family = Number(row.miniFamily);
      if (!Number.isInteger(family) || family < 1 || family > 9) {
        throw new Error(`Invalid mini family for ${row.day}: ${row.miniFamily}`);
      }
      return family;
    }

    function roundedRect(x, y, w, h, r) {
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

    function fillRound(x, y, w, h, r, fill, shadow) {
      ctx.save();
      if (shadow) {
        ctx.shadowColor = shadow.color;
        ctx.shadowBlur = shadow.blur;
        ctx.shadowOffsetY = shadow.y || 0;
        ctx.shadowOffsetX = shadow.x || 0;
      }
      roundedRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }

    function strokeRound(x, y, w, h, r, stroke, lineWidth = 1) {
      ctx.save();
      roundedRect(x, y, w, h, r);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
      ctx.restore();
    }

    function drawText(text, x, y, size, weight, fill, maxWidth) {
      ctx.save();
      ctx.font = `${weight} ${size}px ${fonts.body}`;
      ctx.fillStyle = fill;
      ctx.fillText(text, x, y, maxWidth);
      ctx.restore();
    }

    function wrapLines(text, maxWidth, size, weight) {
      ctx.save();
      ctx.font = `${weight} ${size}px ${fonts.body}`;
      const chars = Array.from(String(text));
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

    function drawWrapped(text, x, y, maxWidth, size, weight, fill, lineHeight, maxLines) {
      let fontSize = size;
      let lines = wrapLines(text, maxWidth, fontSize, weight);
      while (lines.length > maxLines && fontSize > 18) {
        fontSize -= 1;
        lines = wrapLines(text, maxWidth, fontSize, weight);
      }
      ctx.save();
      ctx.font = `${weight} ${fontSize}px ${fonts.body}`;
      ctx.fillStyle = fill;
      lines.slice(0, maxLines).forEach((line, index) => {
        ctx.fillText(line, x, y + index * lineHeight, maxWidth);
      });
      ctx.restore();
      return Math.min(lines.length, maxLines) * lineHeight;
    }

    function drawGradientBackground(t) {
      const theme = post.theme;
      const base = ctx.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, theme.bg1);
      base.addColorStop(0.48, theme.bg2);
      base.addColorStop(1, theme.bg3);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);

      const drift = Math.sin(t * 0.55);
      const glow1 = ctx.createRadialGradient(820 + drift * 34, 180 + Math.cos(t * 0.4) * 28, 20, 820 + drift * 34, 180, 360);
      glow1.addColorStop(0, color(theme.glow, 0.82));
      glow1.addColorStop(0.6, color(theme.glow, 0.18));
      glow1.addColorStop(1, color(theme.glow, 0));
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, width, height);

      const glow2 = ctx.createRadialGradient(110 + Math.cos(t * 0.46) * 25, 1290 + drift * 30, 20, 110, 1290, 420);
      glow2.addColorStop(0, color(theme.accent2, 0.22));
      glow2.addColorStop(1, color(theme.accent2, 0));
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, width, height);

    }

    function drawBrand() {
      const theme = post.theme;
      fillRound(58, 50, 54, 54, 14, theme.ink, { color: 'rgba(16,47,67,.18)', blur: 18, y: 6 });
      drawText('R', 74, 61, 29, '900', '#fff', 40);
      fillRound(128, 51, 154, 53, 26, 'rgba(255,255,255,.90)', { color: 'rgba(16,47,67,.15)', blur: 20, y: 8 });
      drawText('羅針占術', 154, 65, 27, '900', theme.ink, 118);
      fillRound(776, 60, 246, 46, 23, 'rgba(255,255,255,.78)', { color: 'rgba(16,47,67,.12)', blur: 18, y: 8 });
      drawText('誕生日数 × 数秘', 814, 72, 23, '900', theme.ink, 190);
    }

    function getLayoutMetrics() {
      const theme = post.theme;
      const maxTitleWidth = 930;
      const titleLines = post.titleLines && post.titleLines.length
        ? post.titleLines
        : wrapLines(post.title, maxTitleWidth, post.title.length > 20 ? 53 : 57, '900');
      const titleSize = titleLines.length > 1 ? 51 : 57;
      const underlineY = 205 + Math.min(titleLines.length, 2) * 66 + 8;
      const cautionY = underlineY + 24;
      const cautionH = post.caution ? 98 : 0;
      const heroY = post.caution
        ? cautionY + cautionH + 28
        : (titleLines.length > 1 ? 392 : 340);
      return { theme, maxTitleWidth, titleLines, titleSize, underlineY, cautionY, cautionH, heroY };
    }

    function drawTitle(t) {
      const { theme, maxTitleWidth, titleLines, titleSize, underlineY, cautionY, cautionH } = getLayoutMetrics();
      fillRound(58, 126, post.kicker === '占いエンタメ' ? 172 : 112, 48, 24, theme.ink, { color: 'rgba(16,47,67,.16)', blur: 18, y: 8 });
      drawText(post.kicker, 82, 138, 24, '900', '#fff', 138);

      ctx.save();
      ctx.font = `900 ${titleSize}px ${fonts.title}`;
      ctx.fillStyle = theme.ink;
      titleLines.slice(0, 2).forEach((line, index) => {
        ctx.fillText(line, 58, 205 + index * 66, maxTitleWidth);
      });
      ctx.restore();

      fillRound(58, underlineY, 455, 9, 5, color(theme.accent, 0.95));
      const shineX = 58 + ((t * 95) % 580) - 100;
      const shine = ctx.createLinearGradient(shineX, underlineY, shineX + 120, underlineY);
      shine.addColorStop(0, color(theme.glow, 0));
      shine.addColorStop(0.5, color(theme.glow, 0.9));
      shine.addColorStop(1, color(theme.glow, 0));
      fillRound(shineX, underlineY - 1, 120, 11, 5, shine);

      if (post.caution) {
        fillRound(58, cautionY, 964, cautionH, 16, 'rgba(255,255,255,.98)', { color: 'rgba(16,47,67,.10)', blur: 14, y: 6 });
        strokeRound(58, cautionY, 964, cautionH, 16, color(theme.accent, 0.20));
        drawWrapped(post.caution, 82, cautionY + 20, 914, 21, '850', '#24495a', 30, 3);
      }
    }

    function activeRank(t) {
      return Math.min(5, Math.max(1, Math.floor((t % duration) / 2.25) + 1));
    }

    function drawMini(image, x, y, w, h, t, intensity = 1) {
      const bob = Math.sin(t * 2.2 + x * 0.02) * 5 * intensity;
      ctx.save();
      ctx.shadowColor = 'rgba(16,47,67,.18)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 8;
      ctx.drawImage(image, x, y + bob, w, h);
      ctx.restore();
    }

    function drawHero(row, t, yStart) {
      const theme = post.theme;
      const active = activeRank(t) === 1;
      const pulse = 0.5 + Math.sin(t * 2.4) * 0.5;
      fillRound(58, yStart, 964, 246, 28, 'rgba(255,255,255,.92)', { color: 'rgba(16,47,67,.18)', blur: 28, y: 14 });
      strokeRound(58, yStart, 964, 246, 28, color(theme.accent, active ? 0.72 : 0.24), active ? 4 : 2);
      fillRound(80, yStart + 22, 104, 104, 27, color(theme.accent, 1), { color: color(theme.accent, 0.32 + pulse * 0.18), blur: active ? 26 : 18, y: 8 });
      drawText('1位', 104, yStart + 56, 32, '900', '#fff', 64);
      drawMini(images[miniFamilyOfRow(row)], 202, yStart + 34, 142, 174, t, 1.1);
      fillRound(350, yStart + 30, 274, 48, 24, color(theme.accent, 0.12));
      drawText(`${row.day}日生まれ`, 374, yStart + 39, 32, '900', theme.accent, 220);
      drawWrapped(row.reason, 350, yStart + 94, 614, 27, '900', '#173647', 38, 3);

      const memoX = 826;
      fillRound(memoX, yStart + 186, 122, 38, 19, color(theme.ink, 0.92));
      drawText('注目', memoX + 39, yStart + 195, 20, '900', '#fff', 54);
    }

    function drawCompactCard(row, index, t, x, y, w, h) {
      const theme = post.theme;
      const active = activeRank(t) === row.rank;
      const pulse = active ? 0.55 + Math.sin(t * 3) * 0.45 : 0;
      const compact = h < 136;
      const reasonSize = compact ? 18 : 21;
      const reasonLineHeight = compact ? 23 : 29;
      const reasonY = y + (compact ? 64 : 70);
      fillRound(x, y, w, h, 22, 'rgba(255,255,255,.90)', { color: 'rgba(16,47,67,.12)', blur: 22, y: 10 });
      strokeRound(x, y, w, h, 22, color(theme.accent, active ? 0.64 : 0.13), active ? 3 : 1.4);
      if (active) {
        fillRound(x + 8, y + 8, w - 16, 7, 4, color(theme.accent, 0.74 + pulse * 0.14));
      }
      fillRound(x + 18, y + 28, 70, 70, 19, color(theme.accent, 0.94), { color: color(theme.accent, active ? 0.32 : 0.18), blur: active ? 20 : 12, y: 7 });
      drawText(`${row.rank}位`, x + 35, y + 49, 25, '900', '#fff', 48);
      drawMini(images[miniFamilyOfRow(row)], x + 104, y + 22, 76, 100, t + index * 0.4, 0.7);
      drawText(`${row.day}日生まれ`, x + 188, y + 27, 29, '900', theme.accent, w - 214);
      drawWrapped(row.reason, x + 188, reasonY, w - 218, reasonSize, '850', '#203e50', reasonLineHeight, 3);
    }

    function drawSummary(t, yStart) {
      const theme = post.theme;
      const pulse = 0.55 + Math.sin(t * 1.8) * 0.45;
      fillRound(58, yStart, 964, 144, 28, color(theme.ink, 0.98), { color: 'rgba(16,47,67,.24)', blur: 28, y: 14 });
      const shineX = 58 + ((t * 80) % 1060) - 160;
      const gradient = ctx.createLinearGradient(shineX, yStart, shineX + 180, yStart);
      gradient.addColorStop(0, color(theme.glow, 0));
      gradient.addColorStop(0.5, color(theme.glow, 0.16));
      gradient.addColorStop(1, color(theme.glow, 0));
      fillRound(shineX, yStart, 180, 144, 28, gradient);
      fillRound(82, yStart + 30, 118, 84, 22, color(theme.glow, 0.18 + pulse * 0.08));
      drawText('一言で', 107, yStart + 44, 25, '900', '#ffe89d', 82);
      drawText('いうと', 107, yStart + 75, 25, '900', '#ffe89d', 82);
      drawWrapped(post.summary, 226, yStart + 32, 742, 29, '900', '#fff', 40, 2);
    }

    function drawSaveCue(t, yStart) {
      const theme = post.theme;
      fillRound(78, yStart, 924, 136, 30, 'rgba(255,255,255,.98)', { color: 'rgba(16,47,67,.17)', blur: 20, y: 10 });
      strokeRound(78, yStart, 924, 136, 30, color(theme.accent, 0.28));

      ctx.save();
      ctx.fillStyle = color(theme.accent, 0.96);
      ctx.beginPath();
      ctx.moveTo(124, yStart + 28);
      ctx.lineTo(178, yStart + 28);
      ctx.lineTo(178, yStart + 99);
      ctx.lineTo(151, yStart + 80);
      ctx.lineTo(124, yStart + 99);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      drawText(ctaPrimary, 214, yStart + 25, 28, '900', theme.ink, 510);
      drawText(ctaSecondary, 214, yStart + 66, 22, '900', color(theme.ink, 0.80), 470);
      drawText(ctaBadge, 214, yStart + 96, 18, '900', color(theme.accent, 0.96), 560);
      fillRound(752, yStart + 35, 196, 68, 30, color(theme.ink, 0.94));
      drawText('羅針占術へ', 790, yStart + 56, 25, '900', '#fff', 128);
      const progress = Math.min(1, Math.max(0, t / duration));
      fillRound(104, yStart + 126, 872, 5, 3, color(theme.ink, 0.12));
      fillRound(104, yStart + 126, 872 * progress, 5, 3, color(theme.accent, 0.95));
    }

    function drawFooter() {
      drawText('Instagram Reels 9:16', 812, 1698, 21, '900', 'rgba(16,47,67,.46)', 220);
    }

    function draw(t) {
      ctx.clearRect(0, 0, width, height);
      drawGradientBackground(t);
      drawBrand();
      drawTitle(t);
      const { heroY } = getLayoutMetrics();
      drawHero(post.rows[0], t, heroY);
      const gridY = heroY + 274;
      const cardH = post.caution ? 126 : 142;
      const gap = post.caution ? 10 : 14;
      post.rows.slice(1).forEach((row, idx) => {
        drawCompactCard(row, idx + 1, t, 78, gridY + idx * (cardH + gap), 924, cardH);
      });
      const summaryY = gridY + 4 * (cardH + gap) + 20;
      drawSummary(t, summaryY);
      drawSaveCue(t, summaryY + 174);
      drawFooter();
    }

    async function recordCanvas() {
      const mimeCandidates = [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1.64001f',
        'video/mp4',
      ];
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      if (!mimeType) throw new Error('This Chromium build cannot record MP4 from canvas.');
      draw(0);
      const stream = canvas.captureStream(fps);
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4500000 });
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });
      recorder.start(100);
      const start = performance.now();
      await new Promise((resolve) => {
        const frame = (now) => {
          const elapsed = (now - start) / 1000;
          draw(Math.min(duration, elapsed));
          if (elapsed < recordSeconds) {
            requestAnimationFrame(frame);
          } else {
            setTimeout(resolve, 180);
          }
        };
        requestAnimationFrame(frame);
      });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      return btoa(binary);
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
    ctaPrimary: CTA_PRIMARY,
    ctaSecondary: CTA_SECONDARY,
    ctaBadge: CTA_BADGE,
  });
}

async function main() {
  ensureAssets();
  await fs.mkdir(OUT_ROOT, { recursive: true });
  const miniAssets = {};
  for (let family = 1; family <= 9; family += 1) {
    miniAssets[family] = fileUrl(miniPath(family));
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const outputs = [];
  try {
    for (const post of POSTS) {
      const outDir = path.join(OUT_ROOT, post.slug);
      await fs.mkdir(outDir, { recursive: true });
      const rawVideo = path.join(outDir, `${post.slug}-designed-raw.mp4`);
      const video = path.join(outDir, `${post.slug}-designed.mp4`);
      const poster = path.join(outDir, `${post.slug}-designed-poster.jpg`);
      const preview = path.join(outDir, `${post.slug}-designed-preview.jpg`);
      const contact = path.join(outDir, `${post.slug}-designed-contact.jpg`);

      const videoBase64 = await recordDesignedVideo(page, post, miniAssets);
      await fs.writeFile(rawVideo, Buffer.from(videoBase64, 'base64'));
      await transcodeRawVideo(rawVideo, video);
      await fs.rm(rawVideo, { force: true });

      const frames = await extractVideoFrames(video, outDir, post.slug);
      await fs.copyFile(frames[0].path, poster);
      await fs.copyFile(frames[1].path, preview);
      await writeShot(page, contactHtml(post.title, frames), contact, 1900, 1180);
      const metadata = await inspectVideo(video);
      outputs.push({ title: post.title, slug: post.slug, video, poster, preview, contact, frames, metadata });
    }
    const allContact = path.join(OUT_ROOT, '2026-06-14-designed-v4-top5-contact.jpg');
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
