const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const OUTPUT_ROOT = path.join(ROOT, 'videos', 'social', 'instagram', '【インスタ】あるある・ランキング系', '2026-06-13');

const POSTS = [
  {
    slug: 'himitsu-mamorenai',
    title: '秘密守れない生まれ日TOP5',
    accent: '#e24d6b',
    sub: '3系の「しゃべりたい」＋5系の「ノリで言う」',
    oneLiner: '秘密守れない系は、3系の「しゃべりたい」＋5系の「ノリで言う」が強いです。',
    ranks: [
      { rank: '1位', birth: '3日生まれ', reason: '数秘3は会話・表現・明るさの数字です。悪気なく「言っちゃった」が起きやすいタイプです。' },
      { rank: '2位', birth: '23日生まれ', reason: '2＋3＝5。人との距離を詰めるのがうまく、盛り上がると情報を出しすぎがちです。' },
      { rank: '3位', birth: '5日生まれ', reason: '数秘5はノリ・自由・勢いの数字です。秘密を重く抱えるより、その場の流れでポロッと出やすいです。' },
      { rank: '4位', birth: '12日生まれ', reason: '1＋2＝3。話を面白くしようとして、つい余計なことまで言いやすいです。' },
      { rank: '5位', birth: '30日生まれ', reason: '3＋0＝3。サービス精神が強く、場を盛り上げようとして秘密の境界線がゆるくなりがちです。' },
    ],
  },
  {
    slug: 'mood-maker',
    title: 'ムードメーカー生まれ日TOP5',
    accent: '#2b8f73',
    sub: '3系の明るさが最強',
    oneLiner: 'ムードメーカーは、3系の明るさが最強です。そこに5の刺激や6の愛嬌が入ると、さらに人が集まりやすくなります。',
    ranks: [
      { rank: '1位', birth: '3日生まれ', reason: '数秘3そのものです。明るさ・会話・笑いで場の空気を軽くする天才タイプです。' },
      { rank: '2位', birth: '21日生まれ', reason: '2＋1＝3。人に合わせる力もあり、周囲を巻き込みながら楽しい空気を作れます。' },
      { rank: '3位', birth: '30日生まれ', reason: '3＋0＝3。存在感が軽やかで、いるだけで場が明るくなりやすいです。' },
      { rank: '4位', birth: '5日生まれ', reason: '数秘5は刺激と自由の数字です。予測不能な発言や行動で空気を動かすタイプです。' },
      { rank: '5位', birth: '15日生まれ', reason: '1＋5＝6。愛嬌と華があり、人を和ませる力があります。場に甘さや親しみやすさを出せます。' },
    ],
  },
  {
    slug: 'creator-type',
    title: 'クリエイター気質生まれ日TOP5',
    accent: '#6c5ce7',
    sub: '直感・表現・世界観を形にするタイプ',
    oneLiner: 'クリエイター気質は、直感・表現・独自性が強い生まれ日に出やすいです。',
    ranks: [
      { rank: '1位', birth: '11日生まれ', reason: '11は直感・ひらめき・感性のマスターナンバーです。独特な世界観を形にしやすいタイプです。' },
      { rank: '2位', birth: '3日生まれ', reason: '数秘3は表現・創作・言葉・楽しさの数字です。文章、動画、歌、演技、発信に向きます。' },
      { rank: '3位', birth: '22日生まれ', reason: '22は大きな理想を現実化する数字です。作品だけでなく、企画・ブランド・世界観を作る力があります。' },
      { rank: '4位', birth: '7日生まれ', reason: '数秘7は探求・分析・独自性の数字です。深い考察やマニアックな世界観を作り込むタイプです。' },
      { rank: '5位', birth: '29日生まれ', reason: '2＋9＝11。感受性と直感が強く、エモい表現や人の心に刺さる作品を作りやすいです。' },
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

function wrapJapanese(text, maxChars) {
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
  return cleaned;
}

function tspans(lines, x, y, size, lineHeight, attrs = '') {
  return lines.map((line, index) => {
    const dy = index === 0 ? 0 : lineHeight;
    return `<tspan x="${x}" y="${y + index * lineHeight}" ${attrs}>${esc(line)}</tspan>`;
  }).join('');
}

function background(accent) {
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff8f0"/>
        <stop offset="0.46" stop-color="#eef8ff"/>
        <stop offset="1" stop-color="#fff3f7"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${accent}"/>
        <stop offset="1" stop-color="#12384f"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#12384f" flood-opacity=".18"/>
      </filter>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
    <circle cx="930" cy="185" r="190" fill="${accent}" opacity=".13"/>
    <circle cx="110" cy="1715" r="245" fill="#12384f" opacity=".08"/>
    <path d="M0 1760 C 210 1660, 435 1830, 650 1710 S 980 1630, 1080 1715 L1080 1920 L0 1920 Z" fill="${accent}" opacity=".12"/>
  `;
}

function footer() {
  return `
    <text x="64" y="1828" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="30" font-weight="800" fill="#3c5663">当てはまったら保存 / コメントで教えてね</text>
    <text x="64" y="1876" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="28" font-weight="800" fill="#607783">羅針占術</text>
  `;
}

function coverSvg(post) {
  const titleLines = wrapJapanese(post.title, 9);
  const subLines = wrapJapanese(post.sub, 15);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${background(post.accent)}
    <rect x="64" y="186" width="952" height="1190" rx="34" fill="#ffffff" filter="url(#shadow)"/>
    <rect x="64" y="186" width="952" height="18" rx="9" fill="url(#accent)"/>
    <text x="104" y="292" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="34" font-weight="900" fill="${post.accent}">生まれ日ランキング</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="80" font-weight="900" fill="#12384f" letter-spacing="0">${tspans(titleLines, 104, 450, 80, 96)}</text>
    <rect x="104" y="882" width="560" height="76" rx="38" fill="${post.accent}" opacity=".95"/>
    <text x="140" y="932" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="34" font-weight="900" fill="#fff">文字隠しなし</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="43" font-weight="900" fill="#294b5d">${tspans(subLines, 104, 1070, 43, 58)}</text>
    <text x="104" y="1300" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="34" font-weight="800" fill="#607783">1位から5位まで、そのまま見せます</text>
    ${footer()}
  </svg>`;
}

function rankSvg(post, item, index) {
  const reasonLines = wrapJapanese(item.reason, 18);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${background(post.accent)}
    <rect x="52" y="92" width="976" height="1546" rx="30" fill="#ffffff" filter="url(#shadow)"/>
    <rect x="52" y="92" width="976" height="14" rx="7" fill="url(#accent)"/>
    <text x="88" y="186" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="40" font-weight="900" fill="${post.accent}">${esc(post.title)}</text>
    <text x="88" y="360" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="112" font-weight="900" fill="${post.accent}">${esc(item.rank)}</text>
    <text x="88" y="500" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="84" font-weight="900" fill="#12384f">${esc(item.birth)}</text>
    <line x1="88" y1="595" x2="942" y2="595" stroke="#d7e4ea" stroke-width="5"/>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="52" font-weight="900" fill="#243f4c">${tspans(reasonLines, 88, 720, 52, 74)}</text>
    <text x="88" y="1510" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="34" font-weight="900" fill="#607783">TOP5 / ${index + 1} of 5</text>
    ${footer()}
  </svg>`;
}

function summarySvg(post) {
  const lines = wrapJapanese(post.oneLiner, 14);
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    ${background(post.accent)}
    <rect x="64" y="188" width="952" height="1225" rx="34" fill="#ffffff" filter="url(#shadow)"/>
    <rect x="64" y="188" width="952" height="18" rx="9" fill="url(#accent)"/>
    <text x="104" y="310" font-family="'Yu Gothic','Meiryo',sans-serif" font-size="42" font-weight="900" fill="${post.accent}">一言でいうと</text>
    <text font-family="'Yu Gothic','Meiryo',sans-serif" font-size="56" font-weight="900" fill="#12384f">${tspans(lines, 104, 476, 56, 76)}</text>
    <g font-family="'Yu Gothic','Meiryo',sans-serif" font-weight="900">
      ${post.ranks.map((item, idx) => `
        <rect x="104" y="${900 + idx * 88}" width="770" height="62" rx="31" fill="${idx === 0 ? post.accent : '#edf5f8'}" opacity="${idx === 0 ? '.95' : '1'}"/>
        <text x="138" y="${942 + idx * 88}" font-size="33" fill="${idx === 0 ? '#fff' : '#294b5d'}">${esc(item.rank)} ${esc(item.birth)}</text>
      `).join('')}
    </g>
    ${footer()}
  </svg>`;
}

async function renderImage(svg, file) {
  await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toFile(file);
}

function ffmpegPath() {
  const configured = process.env.FFMPEG_BIN || process.env.FFMPEG_PATH;
  if (configured) return configured;
  return 'ffmpeg';
}

async function writeConcatFile(postDir, files) {
  const lines = [];
  for (const item of files) {
    lines.push(`file '${item.file.replace(/\\/g, '/')}'`);
    lines.push(`duration ${item.duration}`);
  }
  lines.push(`file '${files[files.length - 1].file.replace(/\\/g, '/')}'`);
  const concatFile = path.join(postDir, 'concat.txt');
  await fs.writeFile(concatFile, `${lines.join('\n')}\n`, 'utf8');
  return concatFile;
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath(), args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || result.stdout}`);
  }
}

async function makeContactSheet(post, slideFiles, outFile) {
  const thumbWidth = 270;
  const thumbHeight = 480;
  const composites = [];
  for (let i = 0; i < slideFiles.length; i += 1) {
    const buffer = await sharp(slideFiles[i]).resize(thumbWidth, thumbHeight).jpeg({ quality: 88 }).toBuffer();
    composites.push({
      input: buffer,
      left: (i % 4) * thumbWidth,
      top: Math.floor(i / 4) * thumbHeight,
    });
  }
  await sharp({
    create: {
      width: thumbWidth * 4,
      height: thumbHeight * 2,
      channels: 3,
      background: '#f5f7fb',
    },
  }).composite(composites).jpeg({ quality: 90 }).toFile(outFile);
}

async function generatePost(post) {
  const postDir = path.join(OUTPUT_ROOT, post.slug);
  const frameDir = path.join(postDir, 'slides');
  await fs.mkdir(frameDir, { recursive: true });

  const slides = [
    { name: '00-cover.jpg', duration: 1.7, svg: coverSvg(post) },
    ...post.ranks.map((item, index) => ({
      name: `${String(index + 1).padStart(2, '0')}-${post.slug}-rank-${index + 1}.jpg`,
      duration: 1.9,
      svg: rankSvg(post, item, index),
    })),
    { name: '06-summary.jpg', duration: 2.1, svg: summarySvg(post) },
  ];

  const rendered = [];
  for (const slide of slides) {
    const file = path.join(frameDir, slide.name);
    await renderImage(slide.svg, file);
    rendered.push({ file, duration: slide.duration });
  }

  const concatFile = await writeConcatFile(postDir, rendered);
  const videoFile = path.join(postDir, `${post.slug}-reel-no-mask.mp4`);
  runFfmpeg([
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-vf', `fps=${FPS},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.0',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    videoFile,
  ]);

  const previewFile = path.join(postDir, `${post.slug}-preview.jpg`);
  const contactFile = path.join(postDir, `${post.slug}-contact.jpg`);
  await fs.copyFile(rendered[0].file, previewFile);
  await makeContactSheet(post, rendered.map(item => item.file), contactFile);

  return { slug: post.slug, videoFile, previewFile, contactFile };
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
