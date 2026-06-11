const fsSync = require('fs');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const IMAGE_WIDTH = 1080;
const IMAGE_HEIGHT = 1350;
const REEL_WIDTH = 1080;
const REEL_HEIGHT = 1920;
const IMAGE_QUALITY = 92;
const INSTAGRAM_ROOT = path.join(ROOT, 'images', 'social', 'instagram');
const IMAGE_OUT_DIR = path.join(INSTAGRAM_ROOT, '【インスタ】あるある・ランキング系');
const REEL_OUT_DIR = path.join(ROOT, 'videos', 'social', 'instagram', '【インスタ】あるある・ランキング系', '2026-06-12');
const MINI_ROOT = path.join(INSTAGRAM_ROOT, 'birthday-mini');

const POSTS = [
  {
    slug: 'birth_01_aruaru',
    day: 1,
    title: '1日生まれあるある',
    filename: 'birth-01-aruaru.jpg',
    reelFilename: 'birth-01-aruaru-reel-profile-emoji.mp4',
    accent: '#c34a3b',
    bg: ['#fff5e9', '#bfe6f0', '#e8b44c'],
    rows: [
      {
        title: '人に指図されると急にやる気がなくなる',
        body: '自分のペースで動きたいタイプです。\n命令されるより、任されたほうが力を発揮します。',
      },
      {
        title: 'なんだかんだ先頭に立ちがち',
        body: '本人はそのつもりがなくても、気づくとリーダー役になりやすいです。\n「じゃあ私がやるか」と動ける人です。',
      },
      {
        title: '負けず嫌いを隠している',
        body: '表では平気な顔をしていても、内心かなり悔しがります。\n特に、自分が本気を出した分野では負けたくありません。',
      },
      {
        title: '褒められるとかなり伸びる',
        body: 'プライドがあるので、認められると一気に加速します。\n「すごいね」と言われると、さらに結果を出そうとします。',
      },
      {
        title: '最初の一歩は強いけど、飽きると急に冷める',
        body: '始める力はかなり強いです。\nただし、興味がなくなるとスッと別方向に行きます。',
      },
    ],
  },
  {
    slug: 'birth_02_aruaru',
    day: 2,
    title: '2日生まれあるある5選',
    filename: 'birth-02-aruaru.jpg',
    reelFilename: 'birth-02-aruaru-reel-profile-emoji.mp4',
    accent: '#5a7f50',
    bg: ['#fff8f2', '#cfe8db', '#e5a7bd'],
    rows: [
      {
        title: '人の機嫌にすぐ気づく',
        body: '相手の声色や表情の変化に敏感です。\n「なんか今日、機嫌悪い？」を察するのが早いタイプです。',
      },
      {
        title: '自分からグイグイ行くより、相手に合わせがち',
        body: '前に出るより、空気を見て動くほうが得意です。\n強引に引っ張るより、そっと支える側になりやすいです。',
      },
      {
        title: '優しいけど、実はかなり傷つきやすい',
        body: '表では平気そうにしていても、内心ではけっこう引きずります。\n何気ない一言をずっと覚えていることもあります。',
      },
      {
        title: '「大丈夫」と言いながら大丈夫じゃない',
        body: '迷惑をかけたくなくて、つい我慢しがちです。\n本当は気づいてほしいのに、自分からは言い出せないことがあります。',
      },
      {
        title: '好きな人にはめちゃくちゃ尽くす',
        body: '大切な人には、自然と気を配ります。\n相手の好みや小さな変化を覚えていて、さりげなく支えるタイプです。',
      },
    ],
  },
  {
    slug: 'birth_03_aruaru',
    day: 3,
    title: '3日生まれあるある5選',
    filename: 'birth-03-aruaru.jpg',
    reelFilename: 'birth-03-aruaru-reel-profile-emoji.mp4',
    accent: '#c66a34',
    bg: ['#fff7df', '#bfe3e8', '#f0b15f'],
    rows: [
      {
        title: '楽しくないと急にやる気が消える',
        body: '義務感だけで動くのが苦手です。\n「面白そう」「楽しそう」と思えると一気に動けます。',
      },
      {
        title: '場の空気を明るくしがち',
        body: '本人は普通に話しているだけでも、周りが少し和みます。\n重い空気を軽くする才能があります。',
      },
      {
        title: '褒められるとめちゃくちゃ伸びる',
        body: '認められるとテンションが上がり、もっと頑張れます。\n逆に、否定されすぎると一気にしょんぼりしやすいです。',
      },
      {
        title: '話が脱線しやすい',
        body: '会話中に別の面白いことを思いつきやすいです。\n気づいたら本題からかなり離れていることがあります。',
      },
      {
        title: '明るそうに見えて、実は傷つきやすい',
        body: '表では笑ってごまかせますが、内心ではけっこう気にします。\n軽く見られると、意外と深く刺さるタイプです。',
      },
    ],
  },
  {
    slug: 'birth_04_aruaru',
    day: 4,
    title: '4日生まれあるある5選',
    filename: 'birth-04-aruaru.jpg',
    reelFilename: 'birth-04-aruaru-reel-profile-emoji.mp4',
    accent: '#356c63',
    bg: ['#f5fff8', '#c2d7ec', '#8bb56b'],
    rows: [
      {
        title: '適当な人を見ると内心イラッとする',
        body: '約束、時間、ルールを大事にするタイプです。\n「ちゃんとやればいいのに」と思いやすいです。',
      },
      {
        title: 'コツコツ積み上げるのが得意',
        body: '一発逆転より、地道に続けるほうが向いています。\n派手さはなくても、最後にちゃんと結果を出します。',
      },
      {
        title: '信頼するまでに時間がかかる',
        body: 'すぐに心を開くタイプではありません。\nでも一度信頼すると、かなり長く大事にします。',
      },
      {
        title: '予定が崩れると少し不安になる',
        body: 'ノリで動くより、ある程度の計画があるほうが安心します。\n急な変更には内心かなりソワソワしがちです。',
      },
      {
        title: '真面目すぎて損することがある',
        body: '手を抜けず、周りの分まで背負いやすいです。\n「自分がやったほうが早い」と思って抱え込みがちです。',
      },
    ],
  },
];

const DATA_URL_CACHE = new Map();

function familyOf(day) {
  let n = day;
  while (n > 9) n = String(n).split('').reduce((sum, digit) => sum + Number(digit), 0);
  return n;
}

function miniPath(day) {
  return path.join(MINI_ROOT, `birthday-family-${familyOf(day)}-chibi.png`);
}

function fileUrl(filePath) {
  if (DATA_URL_CACHE.has(filePath)) return DATA_URL_CACHE.get(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  const encoded = fsSync.readFileSync(filePath).toString('base64');
  const dataUrl = `data:${mime};base64,${encoded}`;
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
  const missing = POSTS.map(post => miniPath(post.day)).filter(file => !fsSync.existsSync(file));
  if (missing.length) throw new Error(`Missing birthday mini assets:\n${missing.join('\n')}`);
}

function brand() {
  return '<div class="brand"><div class="mark">R</div><div>羅針占術</div></div>';
}

function rowHtml(post) {
  return post.rows.map((row, index) => `
    <article class="row">
      <div class="num">${index + 1}</div>
      <div class="text">
        <h2>${esc(row.title)}</h2>
        <p>${esc(row.body).replaceAll('\n', '<br>')}</p>
      </div>
    </article>
  `).join('');
}

function html(post, height, mode) {
  const isReel = mode === 'reel';
  const width = isReel ? REEL_WIDTH : IMAGE_WIDTH;
  const mini = fileUrl(miniPath(post.day));
  const [light, mid, warm] = post.bg;
  const rows = rowHtml(post);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
    body { font-family: "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif; color: #12384f; }
    .stage {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background:
        radial-gradient(circle at 78% 14%, rgba(255,255,255,.86), transparent 210px),
        radial-gradient(circle at 88% 74%, ${warm}cc, transparent ${isReel ? 470 : 330}px),
        linear-gradient(145deg, ${light} 0%, ${mid} 52%, ${warm} 100%);
    }
    .stage::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(255,255,255,.93), rgba(255,255,255,.77) 59%, rgba(255,255,255,.22)),
        repeating-linear-gradient(135deg, rgba(255,255,255,.18) 0 12px, transparent 12px 42px);
    }
    .stage::after {
      content: "";
      position: absolute;
      right: -86px;
      top: ${isReel ? 210 : 150}px;
      width: ${isReel ? 420 : 320}px;
      height: ${isReel ? 420 : 320}px;
      border-radius: 50%;
      border: 28px solid rgba(255,255,255,.34);
      box-shadow: 0 36px 80px rgba(18,56,79,.13);
    }
    .brand {
      position: absolute;
      left: 56px;
      top: ${isReel ? 72 : 48}px;
      display: inline-flex;
      align-items: center;
      gap: 16px;
      padding: 14px 20px;
      border-radius: 12px;
      background: rgba(255,255,255,.90);
      box-shadow: 0 10px 28px rgba(20,45,60,.16);
      font-weight: 900;
      font-size: 27px;
      z-index: 2;
    }
    .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: #12384f; color: #fff; font-weight: 900; }
    main {
      position: absolute;
      left: 54px;
      top: ${isReel ? 170 : 130}px;
      width: 972px;
      z-index: 2;
    }
    .head {
      display: grid;
      grid-template-columns: 1fr ${isReel ? 220 : 190}px;
      align-items: end;
      gap: 20px;
      margin-bottom: ${isReel ? 28 : 18}px;
    }
    .pill {
      display: inline-flex;
      width: max-content;
      align-items: center;
      justify-content: center;
      margin-bottom: 14px;
      padding: 8px 18px;
      border-radius: 999px;
      background: rgba(18,56,79,.92);
      color: #fff;
      font-size: ${isReel ? 27 : 24}px;
      font-weight: 1000;
      letter-spacing: 0;
    }
    h1 {
      margin: 0;
      color: #12384f;
      font-size: ${isReel ? 70 : 61}px;
      line-height: 1.06;
      letter-spacing: 0;
      font-weight: 1000;
      text-wrap: balance;
    }
    .mini-wrap {
      position: relative;
      height: ${isReel ? 228 : 188}px;
      display: grid;
      place-items: end center;
    }
    .mini-wrap::before {
      content: "${post.day}日";
      position: absolute;
      left: 8px;
      top: 0;
      min-width: 92px;
      padding: 9px 15px;
      border-radius: 999px;
      background: ${post.accent};
      color: #fff;
      text-align: center;
      font-size: ${isReel ? 31 : 28}px;
      font-weight: 1000;
      box-shadow: 0 12px 26px rgba(18,56,79,.20);
    }
    .mini-wrap img {
      width: ${isReel ? 190 : 158}px;
      height: ${isReel ? 210 : 174}px;
      object-fit: contain;
      filter: drop-shadow(0 14px 18px rgba(18,56,79,.20));
    }
    section { display: grid; gap: ${isReel ? 18 : 13}px; }
    .row {
      display: grid;
      grid-template-columns: ${isReel ? 82 : 70}px 1fr;
      align-items: start;
      min-height: ${isReel ? 246 : 178}px;
      padding: ${isReel ? '22px 24px 20px' : '16px 20px 14px'};
      border-radius: 15px;
      background: rgba(255,255,255,.92);
      border: 1px solid rgba(18,56,79,.10);
      box-shadow: 0 14px 34px rgba(16,45,64,.15);
    }
    .num {
      display: grid;
      place-items: center;
      width: ${isReel ? 58 : 52}px;
      height: ${isReel ? 58 : 52}px;
      border-radius: 12px;
      background: ${post.accent};
      color: #fff;
      font-size: ${isReel ? 33 : 29}px;
      line-height: 1;
      font-weight: 1000;
      box-shadow: 0 8px 18px rgba(18,56,79,.16);
    }
    .text h2 {
      margin: 0 0 ${isReel ? 11 : 7}px;
      color: #12384f;
      font-size: ${isReel ? 34 : 29}px;
      line-height: 1.16;
      letter-spacing: 0;
      font-weight: 1000;
    }
    .text p {
      margin: 0;
      color: #24495a;
      font-size: ${isReel ? 28 : 23}px;
      line-height: ${isReel ? 1.43 : 1.32};
      font-weight: 850;
    }
    .url {
      position: absolute;
      right: 54px;
      bottom: ${isReel ? 48 : 30}px;
      z-index: 2;
      color: rgba(255,255,255,.96);
      text-shadow: 0 3px 14px rgba(0,0,0,.55);
      font-weight: 900;
      font-size: ${isReel ? 24 : 22}px;
    }
  </style>
</head>
<body>
  <div class="stage">
    ${brand()}
    <main>
      <div class="head">
        <div>
          <div class="pill">誕生日数あるある</div>
          <h1>${esc(post.title)}</h1>
        </div>
        <div class="mini-wrap"><img src="${mini}" alt=""></div>
      </div>
      <section>${rows}</section>
    </main>
    <div class="url">rashin-senjutsu.onrender.com</div>
  </div>
</body>
</html>`;
}

async function writeShot(page, htmlSource, outPath, width, height, options = {}) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await page.setViewportSize({ width, height });
  await page.setContent(htmlSource, { waitUntil: 'networkidle' });
  await page.screenshot({
    path: outPath,
    type: 'jpeg',
    quality: options.quality || IMAGE_QUALITY,
  });
  return outPath;
}

function resolveFfmpegPath() {
  const configured = String(process.env.FFMPEG_PATH || '').trim();
  if (configured) {
    if (!fsSync.existsSync(configured)) throw new Error(`FFMPEG_PATH does not exist: ${configured}`);
    return configured;
  }
  return 'ffmpeg';
}

function writeReelFromFrame(framePath, outputPath) {
  fsSync.mkdirSync(path.dirname(outputPath), { recursive: true });
  const result = spawnSync(resolveFfmpegPath(), [
    '-y',
    '-loop', '1',
    '-i', framePath,
    '-vf', "zoompan=z='min(zoom+0.00030,1.035)':d=120:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=12,scale=1080:1920:in_range=pc:out_range=tv,format=yuv420p",
    '-frames:v', '120',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-color_range', 'tv',
    '-movflags', '+faststart',
    outputPath,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${outputPath}\n${result.stderr || result.stdout}`);
  }
  return outputPath;
}

function parseTargetSlugs(argv) {
  const slugArg = argv.find(arg => arg.startsWith('--slugs='));
  if (!slugArg) return null;
  const slugs = slugArg
    .slice('--slugs='.length)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return slugs.length ? new Set(slugs) : null;
}

async function main() {
  ensureAssets();
  const targetSlugs = parseTargetSlugs(process.argv.slice(2));
  const selected = targetSlugs ? POSTS.filter(post => targetSlugs.has(post.slug)) : POSTS;
  if (!selected.length) throw new Error('No matching aruaru posts selected.');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rashin-aruaru-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const outputs = [];

  try {
    for (const post of selected) {
      const imagePath = path.join(IMAGE_OUT_DIR, post.filename);
      const framePath = path.join(tmpDir, `${post.slug}-reel-frame.jpg`);
      const reelPath = path.join(REEL_OUT_DIR, post.reelFilename);

      outputs.push(await writeShot(page, html(post, IMAGE_HEIGHT, 'image'), imagePath, IMAGE_WIDTH, IMAGE_HEIGHT));
      await writeShot(page, html(post, REEL_HEIGHT, 'reel'), framePath, REEL_WIDTH, REEL_HEIGHT);
      outputs.push(writeReelFromFrame(framePath, reelPath));
    }
  } finally {
    await browser.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`Generated ${outputs.length} files:`);
  for (const output of outputs) console.log(`- ${output}`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
