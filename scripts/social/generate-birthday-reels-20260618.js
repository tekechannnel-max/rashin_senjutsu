const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const VIDEO_SECONDS = 12;
const OUTPUT_ROOT = path.join(ROOT, 'videos', 'social', 'instagram', '【インスタ】あるある・ランキング系', '2026-06-18');
const MINI_ROOT = path.join(ROOT, 'images', 'social', 'instagram', 'birthday-mini');

const POSTS = [
  {
    slug: 'kuuki-yomisugiru-top5',
    title: '空気を読みすぎる生まれ日TOP5',
    accent: '#e57a6d',
    label: '気配りランキング',
    sub: '気づきすぎて先回りしやすい生まれ日に注目',
    oneLiner: '周りを見られる強みがある一方で、疲れをためやすいところもあります。',
    rows: [
      { badge: '1位', day: 2, reason: '相手の表情や声色の変化にすぐ気づくので、場の空気まで背負いやすいタイプです。' },
      { badge: '2位', day: 11, reason: '感受性がかなり鋭く、まだ言葉になっていない違和感まで先に受け取りがちです。' },
      { badge: '3位', day: 20, reason: '丸く収めたい気持ちが強くて、自分の本音を後回しにしやすいところがあります。' },
      { badge: '4位', day: 29, reason: '共感力が高いぶん、人のテンションに引っぱられて気疲れしやすい傾向があります。' },
      { badge: '5位', day: 6, reason: '優しさで空気を整えにいくタイプなので、つい自分が我慢役になりやすいです。' },
    ],
  },
  {
    slug: 'hitori-hanseikai-top5',
    title: 'ひとり反省会しがちな生まれ日TOP5',
    titleLines: ['ひとり反省会しがちな', '生まれ日TOP5'],
    accent: '#5d7eea',
    label: '考え込みランキング',
    sub: '終わった会話をあとから何度も見直しやすい生まれ日',
    oneLiner: '丁寧さの裏返しでもありますが、考えすぎて心を削りすぎない意識が大事です。',
    rows: [
      { badge: '1位', day: 7, reason: '会話が終わったあとに細部まで思い返して、別の言い方があったかもと考え込みやすいです。' },
      { badge: '2位', day: 4, reason: 'きちんとしたいやり直したい気持ちが強く、自分だけ厳しい採点をしがちなタイプです。' },
      { badge: '3位', day: 16, reason: '一度気になった点を深掘りしやすく、頭の中で何度も会話を再生しやすい傾向があります。' },
      { badge: '4位', day: 22, reason: '責任感が強いので、場の結果まで自分の課題として抱え込みやすいです。' },
      { badge: '5位', day: 25, reason: '本音は冷静でも、ひとり時間に入ると静かに反省モードへ切り替わりやすいです。' },
    ],
  },
  {
    slug: 'birth-05-aruaru',
    title: '5日生まれあるある5選',
    accent: '#2d9c7f',
    label: '5日生まれあるある',
    sub: '自由さと瞬発力が目立ちやすい5日生まれの特徴',
    oneLiner: '軽やかさが魅力ですが、刺激不足になると一気に退屈しやすい一面もあります。',
    rows: [
      { badge: '1', day: 5, reason: '面白そうと思ったら動き出しが早く、まず試してから考える流れに入りやすいです。' },
      { badge: '2', day: 5, reason: '同じ毎日が続くと急に飽きるので、変化や新ネタがあるほど元気が出やすいです。' },
      { badge: '3', day: 5, reason: 'ノリは軽やかでも頭の回転は速く、会話の切り返しが妙にうまいことが多いです。' },
      { badge: '4', day: 5, reason: '縛られるほど抜け道を探したくなり、自分のペースを守れる環境で力を出しやすいです。' },
      { badge: '5', day: 5, reason: 'その場では平気そうでも、実は刺激が切れると気分がしぼみやすいタイプです。' },
    ],
  },
];

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function familyOf(day) {
  let n = Number(day);
  while (n > 9) n = String(n).split('').reduce((sum, digit) => sum + Number(digit), 0);
  return n;
}

function miniPath(family) {
  return path.join(MINI_ROOT, `birthday-family-${family}-chibi.png`);
}

function assertMiniAssets(post) {
  const missing = post.rows
    .map(row => miniPath(familyOf(row.day)))
    .filter(file => !fsSync.existsSync(file));
  if (missing.length) throw new Error(`Missing birthday mini assets:\n${Array.from(new Set(missing)).join('\n')}`);
}

function wrapJapanese(text, maxChars, maxLines = 3) {
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  const lines = [];
  let current = '';
  for (const char of normalized) {
    current += char;
    if ([...current].length >= maxChars || /[。、！？]/.test(char)) {
      lines.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.slice(0, maxLines);
}

function tspans(lines, x, y, lineHeight, attrs = '') {
  return lines.map((line, index) => (
    `<tspan x="${x}" y="${y + index * lineHeight}" ${attrs}>${esc(line)}</tspan>`
  )).join('');
}

function background(accent) {
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff9f2"/>
        <stop offset="0.48" stop-color="#eff6ff"/>
        <stop offset="1" stop-color="#fff3f9"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${accent}"/>
        <stop offset="1" stop-color="#12384f"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#12384f" flood-opacity=".16"/>
      </filter>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <circle cx="904" cy="162" r="188" fill="${accent}" opacity=".12"/>
    <circle cx="148" cy="1722" r="262" fill="#12384f" opacity=".07"/>
    <path d="M0 1768 C 220 1648, 450 1840, 690 1702 S 1008 1638, 1080 1710 L1080 1920 L0 1920 Z" fill="${accent}" opacity=".11"/>
  `;
}

function posterSvg(post) {
  const titleLines = Array.isArray(post.titleLines) && post.titleLines.length
    ? post.titleLines
    : wrapJapanese(post.title, 16, 2);
  const subLines = wrapJapanese(post.sub, 24, 2);
  const oneLinerLines = wrapJapanese(post.oneLiner, 25, 3);
  const rowY = 390;
  const rowGap = 246;
  const rowHeight = 224;
  const rows = post.rows.map((row, index) => {
    const y = rowY + index * rowGap;
    const family = familyOf(row.day);
    const reasonLines = wrapJapanese(row.reason, 27, 3);
    const isAruaru = post.slug === 'birth-05-aruaru';
    return `
      <g>
        <rect x="54" y="${y}" width="972" height="${rowHeight}" rx="28" fill="#ffffff" filter="url(#shadow)"/>
        <rect x="54" y="${y}" width="10" height="${rowHeight}" rx="5" fill="${post.accent}"/>
        <rect x="88" y="${y + 26}" width="92" height="54" rx="18" fill="${index === 0 ? post.accent : '#12384f'}"/>
        <text x="134" y="${y + 63}" text-anchor="middle" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="30" font-weight="900" fill="#fff">${esc(row.badge)}</text>
        <text x="200" y="${y + 65}" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="39" font-weight="900" fill="#12384f">${isAruaru ? '5日生まれ' : `${row.day}日生まれ`}</text>
        <rect x="462" y="${y + 31}" width="82" height="44" rx="22" fill="${post.accent}" opacity=".92"/>
        <text x="503" y="${y + 61}" text-anchor="middle" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="23" font-weight="900" fill="#fff">${family}番</text>
        <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="25" font-weight="800" fill="#294b5d">${tspans(reasonLines, 88, y + 116, 36)}</text>
        <circle cx="887" cy="${y + 113}" r="76" fill="${post.accent}" opacity=".10"/>
      </g>
    `;
  }).join('');

  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${background(post.accent)}
    <rect x="54" y="62" width="972" height="262" rx="32" fill="#ffffff" filter="url(#shadow)"/>
    <rect x="54" y="62" width="972" height="18" rx="9" fill="url(#accent)"/>
    <text x="88" y="136" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="30" font-weight="900" fill="${post.accent}">${esc(post.label)}</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="62" font-weight="900" fill="#12384f">${tspans(titleLines, 88, 218, 72)}</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="31" font-weight="900" fill="#294b5d">${tspans(subLines, 88, 326, 42)}</text>
    ${rows}
    <rect x="54" y="1626" width="972" height="190" rx="30" fill="#ffffff" filter="url(#shadow)"/>
    <rect x="86" y="1656" width="188" height="46" rx="23" fill="${post.accent}" opacity=".92"/>
    <text x="180" y="1687" text-anchor="middle" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="24" font-weight="900" fill="#fff">ひとこと</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="26" font-weight="900" fill="#12384f">${tspans(oneLinerLines, 86, 1738, 33)}</text>
    <text x="64" y="1860" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="29" font-weight="900" fill="#3c5663">保存していつでも思い出してください。</text>
    <text x="64" y="1904" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="27" font-weight="900" fill="#607783">羅針占術</text>
  </svg>`;
}

async function renderPoster(post, file) {
  assertMiniAssets(post);
  const base = await sharp(Buffer.from(posterSvg(post))).png().toBuffer();
  const composites = [];
  const rowY = 390;
  const rowGap = 246;
  for (let index = 0; index < post.rows.length; index += 1) {
    const row = post.rows[index];
    const family = familyOf(row.day);
    const mini = await sharp(miniPath(family))
      .resize({ width: 168, height: 178, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({ input: mini, left: 800, top: rowY + index * rowGap + 24 });
  }
  await sharp(base)
    .composite(composites)
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(file);
}

function ffmpegPath() {
  return process.env.FFMPEG_BIN || process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath(), args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr || result.stdout}`);
}

async function generatePost(post) {
  const postDir = path.join(OUTPUT_ROOT, post.slug);
  await fs.mkdir(postDir, { recursive: true });

  const posterFile = path.join(postDir, `${post.slug}-poster.jpg`);
  const previewFile = path.join(postDir, `${post.slug}-preview.jpg`);
  const contactFile = path.join(postDir, `${post.slug}-contact.jpg`);
  const videoFile = path.join(postDir, `${post.slug}.mp4`);

  await renderPoster(post, posterFile);
  await fs.copyFile(posterFile, previewFile);
  await fs.copyFile(posterFile, contactFile);

  runFfmpeg([
    '-y',
    '-loop', '1',
    '-framerate', String(FPS),
    '-t', String(VIDEO_SECONDS),
    '-i', posterFile,
    '-vf', `fps=${FPS},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    videoFile,
  ]);

  return {
    slug: post.slug,
    title: post.title,
    posterFile,
    previewFile,
    contactFile,
    videoFile,
  };
}

async function main() {
  const results = [];
  for (const post of POSTS) {
    results.push(await generatePost(post));
  }
  const reportFile = path.join(OUTPUT_ROOT, 'generation-report.json');
  await fs.writeFile(reportFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), outputRoot: OUTPUT_ROOT, items: results }, null, 2)}\n`);
  console.log(JSON.stringify({ outputRoot: OUTPUT_ROOT, reportFile, items: results }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
