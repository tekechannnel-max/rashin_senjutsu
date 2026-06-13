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
const OUTPUT_ROOT = path.join(ROOT, 'videos', 'social', 'instagram', '【インスタ】あるある・ランキング系', '2026-06-13');
const MINI_ROOT = path.join(ROOT, 'images', 'social', 'instagram', 'birthday-mini');

const POSTS = [
  {
    slug: 'himitsu-mamorenai',
    title: '秘密守れない生まれ日TOP5',
    accent: '#e24d6b',
    sub: '3系の「しゃべりたい」＋5系の「ノリで言う」',
    oneLiner: '秘密守れない系は、3系の「しゃべりたい」＋5系の「ノリで言う」が強いです。',
    ranks: [
      { rank: '1位', day: 3, reason: '数秘3は会話・表現・明るさの数字です。悪気なく「言っちゃった」が起きやすいタイプです。' },
      { rank: '2位', day: 23, reason: '2＋3＝5。人との距離を詰めるのがうまく、盛り上がると情報を出しすぎがちです。' },
      { rank: '3位', day: 5, reason: '数秘5はノリ・自由・勢いの数字です。秘密を重く抱えるより、その場の流れでポロッと出やすいです。' },
      { rank: '4位', day: 12, reason: '1＋2＝3。話を面白くしようとして、つい余計なことまで言いやすいです。' },
      { rank: '5位', day: 30, reason: '3＋0＝3。サービス精神が強く、場を盛り上げようとして秘密の境界線がゆるくなりがちです。' },
    ],
  },
  {
    slug: 'mood-maker',
    title: 'ムードメーカー生まれ日TOP5',
    accent: '#2b8f73',
    sub: '3系の明るさが最強',
    oneLiner: 'ムードメーカーは、3系の明るさが最強です。そこに5の刺激や6の愛嬌が入ると、さらに人が集まりやすくなります。',
    ranks: [
      { rank: '1位', day: 3, reason: '数秘3そのものです。明るさ・会話・笑いで場の空気を軽くする天才タイプです。' },
      { rank: '2位', day: 21, reason: '2＋1＝3。人に合わせる力もあり、周囲を巻き込みながら楽しい空気を作れます。' },
      { rank: '3位', day: 30, reason: '3＋0＝3。存在感が軽やかで、いるだけで場が明るくなりやすいです。' },
      { rank: '4位', day: 5, reason: '数秘5は刺激と自由の数字です。予測不能な発言や行動で空気を動かすタイプです。' },
      { rank: '5位', day: 15, reason: '1＋5＝6。愛嬌と華があり、人を和ませる力があります。場に甘さや親しみやすさを出せます。' },
    ],
  },
  {
    slug: 'creator-type',
    title: 'クリエイター気質生まれ日TOP5',
    accent: '#6c5ce7',
    sub: '直感・表現・世界観を形にするタイプ',
    oneLiner: 'クリエイター気質は、直感・表現・独自性が強い生まれ日に出やすいです。',
    ranks: [
      { rank: '1位', day: 11, reason: '11は直感・ひらめき・感性のマスターナンバーです。独特な世界観を形にしやすいタイプです。' },
      { rank: '2位', day: 3, reason: '数秘3は表現・創作・言葉・楽しさの数字です。文章、動画、歌、演技、発信に向きます。' },
      { rank: '3位', day: 22, reason: '22は大きな理想を現実化する数字です。作品だけでなく、企画・ブランド・世界観を作る力があります。' },
      { rank: '4位', day: 7, reason: '数秘7は探求・分析・独自性の数字です。深い考察やマニアックな世界観を作り込むタイプです。' },
      { rank: '5位', day: 29, reason: '2＋9＝11。感受性と直感が強く、エモい表現や人の心に刺さる作品を作りやすいです。' },
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
  const missing = post.ranks
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
    if ([...current].length >= maxChars || /[。！？]/.test(char)) {
      lines.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) lines.push(current.trim());
  const cleaned = [];
  for (const line of lines) {
    if (/^[。、！？]+$/.test(line) && cleaned.length) {
      cleaned[cleaned.length - 1] += line;
    } else {
      cleaned.push(line);
    }
  }
  return cleaned.slice(0, maxLines);
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
        <stop offset="0" stop-color="#fffaf3"/>
        <stop offset="0.44" stop-color="#eef8ff"/>
        <stop offset="1" stop-color="#fff2f7"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${accent}"/>
        <stop offset="1" stop-color="#12384f"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#12384f" flood-opacity=".17"/>
      </filter>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <circle cx="916" cy="168" r="190" fill="${accent}" opacity=".13"/>
    <circle cx="128" cy="1708" r="255" fill="#12384f" opacity=".08"/>
    <path d="M0 1762 C 220 1654, 438 1832, 654 1708 S 984 1632, 1080 1714 L1080 1920 L0 1920 Z" fill="${accent}" opacity=".12"/>
  `;
}

function posterSvg(post) {
  const titleLines = wrapJapanese(post.title, 16, 2);
  const subLines = wrapJapanese(post.sub, 22, 2);
  const oneLinerLines = wrapJapanese(post.oneLiner, 24, 3);
  const rowY = 388;
  const rowGap = 246;
  const rowHeight = 224;
  const rows = post.ranks.map((row, index) => {
    const y = rowY + index * rowGap;
    const family = familyOf(row.day);
    const reasonLines = wrapJapanese(row.reason, 27, 3);
    return `
      <g>
        <rect x="54" y="${y}" width="972" height="${rowHeight}" rx="28" fill="#ffffff" filter="url(#shadow)"/>
        <rect x="54" y="${y}" width="10" height="${rowHeight}" rx="5" fill="${post.accent}"/>
        <rect x="88" y="${y + 26}" width="86" height="54" rx="18" fill="${index === 0 ? post.accent : '#12384f'}"/>
        <text x="131" y="${y + 63}" text-anchor="middle" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="30" font-weight="900" fill="#fff">${esc(row.rank)}</text>
        <text x="194" y="${y + 65}" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="39" font-weight="900" fill="#12384f">${row.day}日生まれ</text>
        <rect x="432" y="${y + 31}" width="82" height="44" rx="22" fill="${post.accent}" opacity=".92"/>
        <text x="473" y="${y + 61}" text-anchor="middle" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="23" font-weight="900" fill="#fff">${family}系</text>
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
    <text x="88" y="136" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="30" font-weight="900" fill="${post.accent}">生まれ日ランキング</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="62" font-weight="900" fill="#12384f">${tspans(titleLines, 88, 218, 72)}</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="31" font-weight="900" fill="#294b5d">${tspans(subLines, 88, 326, 42)}</text>
    ${rows}
    <rect x="54" y="1626" width="972" height="190" rx="30" fill="#ffffff" filter="url(#shadow)"/>
    <rect x="86" y="1656" width="172" height="46" rx="23" fill="${post.accent}" opacity=".92"/>
    <text x="172" y="1687" text-anchor="middle" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="24" font-weight="900" fill="#fff">一言でいうと</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="26" font-weight="900" fill="#12384f">${tspans(oneLinerLines, 86, 1738, 33)}</text>
    <text x="64" y="1860" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="29" font-weight="900" fill="#3c5663">当てはまったら保存 / コメントで教えてね</text>
    <text x="64" y="1904" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="27" font-weight="900" fill="#607783">羅針占術</text>
  </svg>`;
}

async function renderPoster(post, file) {
  assertMiniAssets(post);
  const base = await sharp(Buffer.from(posterSvg(post))).png().toBuffer();
  const composites = [];
  const rowY = 388;
  const rowGap = 246;
  for (let index = 0; index < post.ranks.length; index += 1) {
    const row = post.ranks[index];
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
  return process.env.FFMPEG_BIN || process.env.FFMPEG_PATH || 'ffmpeg';
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath(), args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || result.stdout}`);
  }
}

async function generatePost(post) {
  const postDir = path.join(OUTPUT_ROOT, post.slug);
  await fs.mkdir(postDir, { recursive: true });

  const posterFile = path.join(postDir, `${post.slug}-poster.jpg`);
  const previewFile = path.join(postDir, `${post.slug}-preview.jpg`);
  const contactFile = path.join(postDir, `${post.slug}-contact.jpg`);
  const videoFile = path.join(postDir, `${post.slug}-reel-no-mask.mp4`);

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

  return { slug: post.slug, videoFile, previewFile, contactFile, posterFile };
}

async function main() {
  const results = [];
  for (const post of POSTS) {
    results.push(await generatePost(post));
  }
  console.log(JSON.stringify({ outputRoot: OUTPUT_ROOT, videos: results }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
