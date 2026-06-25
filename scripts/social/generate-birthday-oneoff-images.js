const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');
const { birthdayMiniFamilyForDay } = require('./birthday-mini-family');

const ROOT = path.resolve(__dirname, '..', '..');
const WIDTH = 1080;
const HEIGHT = 1350;
const QUALITY = 92;
const INSTAGRAM_ROOT = path.join(ROOT, 'images', 'social', 'instagram');
const OUT_DIR = path.join(INSTAGRAM_ROOT, '【インスタ】あるある・ランキング系');
const MINI_ROOT = path.join(INSTAGRAM_ROOT, 'birthday-mini');

const DATA_URL_CACHE = new Map();

const CLASSIFICATION_PRESETS = [
  {
    filename: 'idol-style-4class.jpg',
    kind: 'アイドル分類',
    title: 'アイドルになったら大体こんな感じ',
    topQuestion: 'あなたは何日生まれ？',
    theme: 'idol',
    accent: '#b83e5a',
    rows: [
      {
        no: '①',
        title: 'センター・カリスマ型',
        days: [1, 8, 10, 17, 19, 22, 26, 28],
        daysText: '1日・8日・10日・17日・19日・22日・26日・28日',
        copy: 'グループの顔、エース、リーダー候補。華・存在感・勝負強さで目立つタイプです。',
      },
      {
        no: '②',
        title: '愛されファンサ型',
        days: [2, 3, 6, 12, 15, 20, 21, 24, 30],
        daysText: '2日・3日・6日・12日・15日・20日・21日・24日・30日',
        copy: 'ファン対応が強い、可愛い、親しみやすいタイプです。握手会・配信・SNSで人気が出やすいです。',
      },
      {
        no: '③',
        title: '世界観・沼らせ型',
        days: [7, 9, 11, 16, 18, 25, 27, 29],
        daysText: '7日・9日・11日・16日・18日・25日・27日・29日',
        copy: 'ミステリアス、儚い、独特な雰囲気で刺さるタイプです。コアファンを深く沼らせます。',
      },
      {
        no: '④',
        title: '職人・クセ強パフォーマー型',
        days: [4, 5, 13, 14, 23, 31],
        daysText: '4日・5日・13日・14日・23日・31日',
        copy: 'ダンス・歌・バラエティ・キャラ立ちで勝負するタイプです。最初はクセ強、後から評価されやすいです。',
      },
    ],
  },
  {
    filename: 'love-style-4class.jpg',
    kind: '恋愛スタイル',
    title: '恋愛スタイル4分類',
    topQuestion: 'あなたは何日生まれ？',
    theme: 'love',
    accent: '#c54f78',
    rows: [
      {
        no: '①',
        title: '追いかける主導権型',
        days: [1, 8, 10, 17, 19, 22, 26, 28],
        daysText: '1日・8日・10日・17日・19日・22日・26日・28日',
        copy: '好きになったら自分から動く。恋愛でも主導権を握りやすいタイプです。',
      },
      {
        no: '②',
        title: '愛されたい・尽くしたい型',
        days: [2, 6, 11, 15, 20, 24, 29],
        daysText: '2日・6日・11日・15日・20日・24日・29日',
        copy: '愛情深く、相手との距離感や気持ちのつながりを大事にするタイプです。',
      },
      {
        no: '③',
        title: 'ときめき・自由恋愛型',
        days: [3, 5, 12, 14, 21, 23, 30],
        daysText: '3日・5日・12日・14日・21日・23日・30日',
        copy: '楽しさ、刺激、会話のテンポを重視します。束縛されると冷めやすいタイプです。',
      },
      {
        no: '④',
        title: '慎重・深愛・内面重視型',
        days: [4, 7, 9, 13, 16, 18, 25, 27, 31],
        daysText: '4日・7日・9日・13日・16日・18日・25日・27日・31日',
        copy: 'すぐには心を開かないけれど、本気になると深く長く愛するタイプです。',
      },
    ],
  },
];

const RANKING_PRESETS = [
  {
    filename: 'amae-jouzu-top5.jpg',
    title: '甘え上手ランキングtop5',
    kind: 'ランキング',
    theme: 'amae',
    accent: '#c54f78',
    rows: [
      {
        rank: 1,
        day: 2,
        type: '素直に頼れる甘え上手',
        note: '数秘2は、受け取る力・寄り添う力が強い数字です。「お願いしてもいい？」が自然に言えるタイプです。',
      },
      {
        rank: 2,
        day: 6,
        type: '愛され上手な甘えん坊',
        note: '数秘6は、愛情・可愛げ・家庭的な魅力の数字です。甘えることで相手の庇護欲をくすぐりやすいです。',
      },
      {
        rank: 3,
        day: 15,
        type: '色気で甘えるタイプ',
        note: '1＋5＝6なので、6の愛され力があります。さらに15日は恋愛感が強く、甘え方に少し色気が出やすいです。',
      },
      {
        rank: 4,
        day: 3,
        type: '明るく懐くタイプ',
        note: '数秘3は、無邪気さ・明るさ・表現力の数字です。重くならず、可愛く甘えられるタイプです。',
      },
      {
        rank: 5,
        day: 20,
        type: '控えめに頼るタイプ',
        note: '2の要素が強く、相手の空気を見ながら甘えます。ガツガツせず、そっと寄り添う甘え方が得意です。',
      },
    ],
  },
  {
    filename: 'buchigire-kowai-top5.jpg',
    title: 'ブチギレると怖い生まれ日TOP5はこちらです。',
    subtitle: '数秘術の象意ベースで、怒った時の圧・爆発力・言葉の鋭さ・執念深さで見ています。',
    kind: 'ランキング',
    theme: 'anger',
    accent: '#b83e5a',
    rows: [
      {
        rank: 1,
        day: 8,
        type: '圧で黙らせるタイプ',
        note: '数秘8は、力・支配・勝負の数字です。怒ると空気が一気に重くなり、「逆らったら終わる感」が出ます。',
      },
      {
        rank: 2,
        day: 1,
        type: '真っ向から叩き潰すタイプ',
        note: '数秘1は、プライドと突破力の数字です。舐められたり否定されたりすると、真正面から強い言葉で返します。',
      },
      {
        rank: 3,
        day: 16,
        type: '静かに核心を刺すタイプ',
        note: '1＋6＝7で、分析力が強い日です。感情的に怒鳴るより、相手の痛いところを冷静に突く怖さがあります。',
      },
      {
        rank: 4,
        day: 22,
        type: 'スケール大きめに怒るタイプ',
        note: '数秘22は、現実化と大物感のマスターナンバーです。普段は抑えていても、限界を超えると怒りの規模が大きいです。',
      },
      {
        rank: 5,
        day: 5,
        type: '瞬間爆発タイプ',
        note: '数秘5は、自由・刺激・衝動の数字です。怒ると急にスイッチが入り、予測不能な勢いで爆発しやすいです。',
      },
    ],
  },
];

function familyOf(day) {
  return birthdayMiniFamilyForDay(day);
}

function uniqueFamilies(days) {
  return Array.from(new Set(days.map(familyOf))).sort((a, b) => a - b);
}

function miniPath(family) {
  return path.join(MINI_ROOT, `birthday-family-${family}-chibi.png`);
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
  const required = Array.from({ length: 9 }, (_, index) => miniPath(index + 1));
  const missing = required.filter((file) => !fsSync.existsSync(file));
  if (missing.length) throw new Error(`Missing assets:\n${missing.join('\n')}`);
}

function brand() {
  return '<div class="brand"><div class="mark">R</div><div>羅針占術</div></div>';
}

function baseHtml(body, extraCss = '') {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    body { font-family: "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif; color: #12384f; }
    .stage { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #f5fbff; }
    .topic-bg { position:absolute; inset:0; overflow:hidden; }
    .topic-bg i, .topic-bg b, .topic-bg span { position:absolute; display:block; }
    .wash { position:absolute; inset:0; background:
      radial-gradient(circle at 74% 15%, rgba(255,255,255,.62), transparent 180px),
      linear-gradient(90deg, rgba(255,255,255,.93), rgba(255,255,255,.78) 58%, rgba(255,255,255,.14)); }
    .brand { position:absolute; left:56px; top:52px; display:inline-flex; align-items:center; gap:16px; padding:14px 20px; border-radius:12px; background:rgba(255,255,255,.88); box-shadow:0 10px 30px rgba(20,45,60,.16); font-weight:900; font-size:27px; }
    .mark { display:grid; place-items:center; width:44px; height:44px; border-radius:8px; background:#12384f; color:#fff; font-weight:900; }
    .pill { display:inline-flex; align-items:center; justify-content:center; padding:8px 16px; border-radius:999px; background:rgba(18,56,79,.92); color:#fff; font-size:24px; font-weight:900; }
    .url { position:absolute; right:54px; bottom:34px; color:rgba(255,255,255,.96); text-shadow:0 3px 14px rgba(0,0,0,.55); font-weight:900; font-size:22px; }
    .theme-idol { background:
      radial-gradient(circle at 72% 12%, rgba(255,240,167,.90), transparent 140px),
      radial-gradient(circle at 88% 70%, rgba(86,174,198,.52), transparent 280px),
      linear-gradient(145deg, #12192f 0%, #22446b 48%, #9b4d75 100%); }
    .theme-love { background:
      radial-gradient(circle at 76% 18%, rgba(255,225,236,.95), transparent 190px),
      radial-gradient(circle at 92% 76%, rgba(242,164,191,.72), transparent 290px),
      linear-gradient(145deg, #fff1f7 0%, #b9d7ee 52%, #d95386 100%); }
    .theme-amae { background:
      radial-gradient(circle at 76% 18%, rgba(255,246,210,.96), transparent 170px),
      radial-gradient(circle at 86% 74%, rgba(255,187,200,.76), transparent 300px),
      linear-gradient(145deg, #fff7df 0%, #cdebf0 50%, #f1a2b7 100%); }
    .theme-anger { background:
      radial-gradient(circle at 78% 16%, rgba(255,209,115,.58), transparent 150px),
      radial-gradient(circle at 84% 68%, rgba(171,28,52,.72), transparent 300px),
      linear-gradient(145deg, #141820 0%, #3b2636 42%, #9f1f36 100%); }
    .beam { width:220px; height:1380px; top:-80px; transform-origin:50% 0; background:linear-gradient(180deg, rgba(255,255,255,.44), rgba(255,255,255,0)); filter:blur(4px); clip-path:polygon(48% 0, 58% 0, 100% 100%, 0 100%); }
    .beam-1 { right:280px; transform:rotate(-21deg); }
    .beam-2 { right:58px; transform:rotate(16deg); opacity:.72; }
    .stage-disc { right:34px; bottom:88px; width:380px; height:88px; border-radius:50%; background:rgba(255,255,255,.24); border:4px solid rgba(255,244,169,.36); box-shadow:0 0 38px rgba(255,244,169,.26); }
    .star { width:18px; height:18px; background:#ffe98a; clip-path:polygon(50% 0, 62% 34%, 98% 35%, 69% 56%, 79% 91%, 50% 70%, 21% 91%, 31% 56%, 2% 35%, 38% 34%); box-shadow:0 0 16px rgba(255,232,126,.74); }
    .star-1 { right:106px; top:160px; transform:scale(1.9) rotate(8deg); }
    .star-2 { right:348px; top:330px; transform:scale(1.35) rotate(-12deg); }
    .star-3 { right:168px; bottom:220px; transform:scale(1.55) rotate(18deg); }
    .heart { width:54px; height:54px; transform:rotate(-45deg); background:rgba(211,66,110,.34); border-radius:10px; box-shadow:0 16px 30px rgba(116,34,62,.12); }
    .heart::before, .heart::after { content:""; position:absolute; width:54px; height:54px; border-radius:50%; background:inherit; }
    .heart::before { left:0; top:-27px; }
    .heart::after { left:27px; top:0; }
    .heart-1 { right:110px; top:140px; transform:rotate(-45deg) scale(1.6); }
    .heart-2 { right:304px; top:360px; transform:rotate(-31deg) scale(.98); opacity:.68; }
    .heart-3 { right:86px; bottom:210px; transform:rotate(-58deg) scale(1.15); opacity:.75; }
    .bubble { border-radius:50%; background:rgba(255,255,255,.42); border:2px solid rgba(255,255,255,.55); box-shadow:0 14px 38px rgba(116,84,98,.12); }
    .bubble-1 { right:82px; top:130px; width:154px; height:154px; }
    .bubble-2 { right:292px; top:354px; width:88px; height:88px; }
    .bubble-3 { right:62px; bottom:190px; width:210px; height:210px; opacity:.72; }
    .ribbon { width:330px; height:84px; right:40px; bottom:330px; border-radius:999px; background:rgba(255,167,187,.33); transform:rotate(-18deg); box-shadow:0 18px 36px rgba(180,85,112,.14); }
    .bolt { width:110px; height:330px; background:linear-gradient(180deg, #ffd36a, #e8374e); clip-path:polygon(54% 0, 100% 0, 64% 43%, 92% 43%, 24% 100%, 42% 55%, 10% 55%); filter:drop-shadow(0 0 18px rgba(255,76,68,.58)); }
    .bolt-1 { right:124px; top:104px; transform:rotate(18deg) scale(1.1); }
    .bolt-2 { right:330px; top:420px; transform:rotate(-17deg) scale(.66); opacity:.66; }
    .slash { width:420px; height:18px; right:-40px; background:rgba(255,255,255,.20); transform:rotate(-28deg); border-radius:999px; }
    .slash-1 { top:260px; }
    .slash-2 { top:605px; opacity:.56; }
    .slash-3 { bottom:210px; opacity:.42; }
    ${extraCss}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function topicBackground(theme) {
  const decor = {
    idol: `
      <i class="beam beam-1"></i><i class="beam beam-2"></i><i class="stage-disc"></i>
      <i class="star star-1"></i><i class="star star-2"></i><i class="star star-3"></i>`,
    love: `
      <i class="heart heart-1"></i><i class="heart heart-2"></i><i class="heart heart-3"></i>
      <i class="bubble bubble-2"></i>`,
    amae: `
      <i class="bubble bubble-1"></i><i class="bubble bubble-2"></i><i class="bubble bubble-3"></i>
      <i class="heart heart-2"></i><i class="ribbon"></i>`,
    anger: `
      <i class="bolt bolt-1"></i><i class="bolt bolt-2"></i>
      <i class="slash slash-1"></i><i class="slash slash-2"></i><i class="slash slash-3"></i>`,
  };
  return `<div class="topic-bg theme-${theme}">${decor[theme] || ''}</div><div class="wash"></div>`;
}

function miniCluster(days) {
  return uniqueFamilies(days).map((family) => `
    <span class="mini-item">
      <img src="${fileUrl(miniPath(family))}" alt="">
      <b>${family}系</b>
    </span>
  `).join('');
}

function classificationHtml(preset) {
  const rows = preset.rows.map((row) => `
    <article class="class-card">
      <div class="class-text">
        <div class="class-head"><span>${esc(row.no)}</span><strong>${esc(row.title)}</strong></div>
        <p class="days">${esc(row.daysText)}</p>
        <p class="copy">${esc(row.copy)}</p>
      </div>
      <div class="mini-cluster">${miniCluster(row.days)}</div>
    </article>
  `).join('');

  return baseHtml(`
    <div class="stage">
      ${topicBackground(preset.theme)}
      ${brand()}
      <main class="classification">
        <div class="class-top">
          <div class="pill">${esc(preset.kind)}</div>
          <div class="top-question">${esc(preset.topQuestion)}</div>
        </div>
        <h1>${esc(preset.title)}</h1>
        <section>${rows}</section>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .classification { position:absolute; left:58px; top:150px; width:964px; }
    .class-top { display:flex; align-items:center; gap:18px; }
    .top-question { display:inline-flex; align-items:center; min-height:44px; padding:8px 18px; border-radius:999px; background:rgba(255,255,255,.90); color:#12384f; box-shadow:0 10px 24px rgba(16,45,64,.13); font-size:28px; line-height:1; font-weight:1000; }
    .classification h1 { margin:18px 0 22px; width:960px; font-size:52px; line-height:1.08; letter-spacing:0; color:#12384f; }
    .classification section { display:grid; gap:16px; }
    .class-card { display:grid; grid-template-columns: 1fr 250px; gap:18px; min-height:236px; padding:20px 22px; border-radius:16px; background:rgba(255,255,255,.92); box-shadow:0 14px 34px rgba(16,45,64,.15); border:1px solid rgba(18,56,79,.10); }
    .class-head { display:flex; align-items:center; gap:12px; color:${preset.accent}; line-height:1.08; }
    .class-head span { display:grid; place-items:center; min-width:48px; height:48px; border-radius:10px; background:#12384f; color:#fff; font-size:27px; font-weight:1000; }
    .class-head strong { font-size:34px; font-weight:1000; }
    .days { margin:12px 0 8px; color:#12384f; font-size:24px; line-height:1.22; font-weight:1000; }
    .copy { margin:0; color:#284b5d; font-size:24px; line-height:1.36; font-weight:850; }
    .mini-cluster { display:grid; grid-template-columns:repeat(3, 1fr); align-content:center; justify-items:center; gap:8px 7px; }
    .mini-item { position:relative; display:grid; place-items:center; width:72px; height:90px; }
    .mini-item img { max-width:76px; max-height:88px; object-fit:contain; filter:drop-shadow(0 7px 9px rgba(18,56,79,.18)); }
    .mini-item b { position:absolute; left:0; top:0; min-width:35px; height:24px; padding:2px 6px; border-radius:999px; background:rgba(18,56,79,.94); color:#fff; font-size:14px; line-height:20px; text-align:center; }
  `);
}

function rankingHtml(preset) {
  const rows = preset.rows.map((row) => {
    const family = familyOf(row.day);
    return `
      <article class="rank-card">
        <div class="rank-no">${row.rank}位</div>
        <img src="${fileUrl(miniPath(family))}" alt="">
        <div class="rank-text">
          <h2>${row.day}日生まれ</h2>
          <strong>${esc(row.type)}</strong>
          <p>${esc(row.note)}</p>
        </div>
      </article>
    `;
  }).join('');

  return baseHtml(`
    <div class="stage">
      ${topicBackground(preset.theme)}
      ${brand()}
      <main class="ranking">
        <div class="pill">${esc(preset.kind)}</div>
        <h1>${esc(preset.title)}</h1>
        ${preset.subtitle ? `<p class="subtitle">${esc(preset.subtitle)}</p>` : ''}
        <section>${rows}</section>
      </main>
      <div class="url">rashin-senjutsu.onrender.com</div>
    </div>
  `, `
    .ranking { position:absolute; left:58px; top:145px; width:950px; }
    .ranking h1 { margin:18px 0 ${preset.subtitle ? '10px' : '22px'}; width:900px; font-size:${preset.subtitle ? '45px' : '55px'}; line-height:1.1; letter-spacing:0; color:#12384f; }
    .subtitle { margin:0 0 16px; width:880px; color:#294b5d; font-size:22px; line-height:1.35; font-weight:900; }
    .ranking section { display:grid; gap:12px; }
    .rank-card { display:grid; grid-template-columns:72px 112px 1fr; align-items:center; min-height:${preset.subtitle ? '151px' : '164px'}; padding:11px 16px; border-radius:15px; background:rgba(255,255,255,.92); box-shadow:0 14px 34px rgba(16,45,64,.15); border:1px solid rgba(18,56,79,.10); }
    .rank-no { font-size:31px; font-weight:1000; color:#f0bd56; text-shadow:0 2px 0 #12384f; }
    .rank-card img { width:104px; height:126px; object-fit:contain; filter:drop-shadow(0 8px 12px rgba(18,56,79,.20)); }
    .rank-text h2 { margin:0 0 1px; color:${preset.accent}; font-size:30px; line-height:1.02; }
    .rank-text strong { display:block; color:#12384f; font-size:23px; line-height:1.13; }
    .rank-text p { margin:5px 0 0; color:#1f4355; font-size:${preset.subtitle ? '18px' : '19px'}; line-height:1.26; font-weight:800; }
  `);
}

async function writeShot(page, html, outPath) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.screenshot({ path: outPath, type: 'jpeg', quality: QUALITY });
  return outPath;
}

function parseTargetFiles(argv) {
  const fileArg = argv.find((arg) => arg.startsWith('--files='));
  if (!fileArg) return null;
  const files = fileArg
    .slice('--files='.length)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return files.length ? new Set(files) : null;
}

async function main() {
  ensureAssets();
  const targetFiles = parseTargetFiles(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const outputs = [];
  try {
    for (const preset of CLASSIFICATION_PRESETS) {
      if (targetFiles && !targetFiles.has(preset.filename)) continue;
      outputs.push(await writeShot(page, classificationHtml(preset), path.join(OUT_DIR, preset.filename)));
    }
    for (const preset of RANKING_PRESETS) {
      if (targetFiles && !targetFiles.has(preset.filename)) continue;
      outputs.push(await writeShot(page, rankingHtml(preset), path.join(OUT_DIR, preset.filename)));
    }
  } finally {
    await browser.close();
  }
  console.log(`Generated ${outputs.length} images:`);
  for (const output of outputs) console.log(`- ${output}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
