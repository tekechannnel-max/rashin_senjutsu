const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');
const { LENORMAND_EMPATHY_POSTS } = require('./content/lenormand-empathy-posts');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_JS = path.join(ROOT, 'app.js');
const WIDTH = 1080;
const HEIGHT = 1350;
const DEFAULT_QUALITY = 88;
const OUT_ROOT = path.join(ROOT, 'images', 'social', 'instagram');
const CHARACTER_IMAGE = path.join(OUT_ROOT, 'rashin-host-inspired-v1.png');

function parseArgs(argv) {
  const args = {
    kind: 'all',
    quality: DEFAULT_QUALITY,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--kind') args.kind = argv[++i] || args.kind;
    else if (arg.startsWith('--kind=')) args.kind = arg.split('=')[1] || args.kind;
    else if (arg === '--quality') args.quality = Number(argv[++i] || args.quality);
    else if (arg.startsWith('--quality=')) args.quality = Number(arg.split('=')[1] || args.quality);
  }
  if (!['all', 'oracle', 'empathy', 'static'].includes(args.kind)) {
    throw new Error(`Invalid --kind: ${args.kind}`);
  }
  if (!Number.isFinite(args.quality) || args.quality < 60 || args.quality > 100) {
    throw new Error(`Invalid --quality: ${args.quality}`);
  }
  return args;
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
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fileUrl(filePath) {
  const resolved = path.resolve(filePath);
  const ext = path.extname(resolved).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fsSync.readFileSync(resolved).toString('base64')}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripLenormandLead(body, cardName) {
  return String(body || '').replace(new RegExp(`^ルノルマンカード「${escapeRegExp(cardName)}」[。\\s]*`), '').trim();
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function visualText(value, maxLength) {
  const text = compactText(value);
  if (text.length <= maxLength) return text;
  const firstSentence = text.match(/^(.+?。)/);
  if (firstSentence && firstSentence[1].length <= maxLength) return firstSentence[1];
  return `${text.slice(0, maxLength - 1)}…`;
}

function oracleVisualMessage(card) {
  return visualText(card.message, 54);
}

function oracleVisualAction(card) {
  return visualText(card.action, 42);
}

function empathyVisualReading(item) {
  return visualText(stripLenormandLead(item.body, item.cardName), 62);
}

const PALETTES = [
  { accent: '#fde68a', sub: '#67e8f9', start: '#13201d', mid: '#111827', end: '#241727', glowA: '252, 211, 77', glowB: '56, 189, 248' },
  { accent: '#f8b4b4', sub: '#bae6fd', start: '#1d2028', mid: '#10231f', end: '#291825', glowA: '248, 180, 180', glowB: '103, 232, 249' },
  { accent: '#a7f3d0', sub: '#fef3c7', start: '#10231e', mid: '#162034', end: '#2a1b16', glowA: '167, 243, 208', glowB: '254, 243, 199' },
  { accent: '#fcd34d', sub: '#c7d2fe', start: '#1b1f2c', mid: '#11212a', end: '#2b1d20', glowA: '252, 211, 77', glowB: '199, 210, 254' },
  { accent: '#f9a8d4', sub: '#99f6e4', start: '#1f1c28', mid: '#102521', end: '#24172a', glowA: '249, 168, 212', glowB: '153, 246, 228' },
  { accent: '#bfdbfe', sub: '#fde68a', start: '#122033', mid: '#1a1f26', end: '#17251c', glowA: '191, 219, 254', glowB: '253, 230, 138' },
  { accent: '#fed7aa', sub: '#a7f3d0', start: '#1f1a23', mid: '#13222b', end: '#251d13', glowA: '254, 215, 170', glowB: '167, 243, 208' },
  { accent: '#ddd6fe', sub: '#fef08a', start: '#171b2a', mid: '#1e2025', end: '#10251f', glowA: '221, 214, 254', glowB: '254, 240, 138' },
];

function paletteCss(id) {
  const palette = PALETTES[((Number(id) || 1) - 1) % PALETTES.length];
  return `
    .post {
      --accent: ${palette.accent};
      --sub: ${palette.sub};
      background:
        radial-gradient(circle at 16% 14%, rgba(${palette.glowA}, .32), transparent 31%),
        radial-gradient(circle at 86% 22%, rgba(${palette.glowB}, .25), transparent 32%),
        linear-gradient(145deg, ${palette.start} 0%, ${palette.mid} 47%, ${palette.end} 100%);
    }
    .brand, .title, .action, .name { color: var(--accent); }
    .kicker, .label { color: var(--sub); }
    .brand-mark {
      background: linear-gradient(135deg, var(--accent), #f8fafc 48%, var(--sub));
    }
  `;
}

function oracleLayoutCss(id) {
  const layout = ((Number(id) || 1) - 1) % 8;
  const variants = [
    `
      .card-art { left: 70px; top: 178px; width: 452px; height: 678px; transform: rotate(-1.4deg); }
      .hero-copy { left: 560px; right: 70px; top: 180px; height: 520px; }
      .panel { left: 70px; right: 440px; bottom: 112px; }
      .character-frame { right: 58px; bottom: 106px; width: 330px; height: 500px; }
    `,
    `
      .bg { opacity: .55; filter: blur(8px) saturate(1.18); transform: scale(1.08); }
      .hero-copy { left: 72px; right: 420px; top: 176px; height: 470px; }
      .card-art { left: auto; right: 74px; top: 172px; width: 348px; height: 522px; transform: rotate(2deg); }
      .panel { left: 72px; right: 394px; bottom: 110px; }
      .character-frame { right: 64px; bottom: 92px; width: 276px; height: 426px; }
    `,
    `
      .card-art { left: 338px; top: 148px; width: 404px; height: 606px; transform: rotate(.8deg); }
      .hero-copy { left: 72px; right: 72px; top: 780px; height: 230px; text-align: center; align-items: center; }
      .panel { left: 72px; right: 72px; bottom: 92px; min-height: 230px; padding: 30px 42px; text-align: center; }
      .character-frame { right: 58px; top: 178px; bottom: auto; width: 230px; height: 350px; }
    `,
    `
      .card-art { left: 64px; top: 158px; width: 372px; height: 558px; transform: rotate(-2.2deg); }
      .hero-copy { left: 472px; right: 64px; top: 156px; height: 420px; }
      .panel { left: 472px; right: 64px; bottom: 114px; min-height: 440px; }
      .character-frame { left: 76px; right: auto; bottom: 92px; width: 300px; height: 452px; }
    `,
    `
      .bg { opacity: .60; filter: blur(5px) saturate(1.2); transform: scale(1.06); }
      .hero-copy { left: 74px; right: 74px; top: 166px; height: 390px; }
      .title { font-size: 84px; }
      .card-art { left: 666px; top: 552px; width: 314px; height: 471px; transform: rotate(3deg); }
      .panel { left: 74px; right: 430px; bottom: 112px; min-height: 470px; }
      .character-frame { right: 68px; top: 180px; bottom: auto; width: 300px; height: 430px; }
    `,
    `
      .card-art { left: 74px; top: 150px; width: 470px; height: 705px; transform: rotate(.6deg); }
      .hero-copy { left: 578px; right: 68px; top: 150px; height: 330px; }
      .panel { left: 578px; right: 68px; bottom: 128px; min-height: 520px; }
      .character-frame { left: 92px; right: auto; bottom: 78px; width: 316px; height: 420px; }
      .footer { left: 578px; }
    `,
    `
      .card-art { left: 384px; top: 152px; width: 332px; height: 498px; transform: rotate(-1deg); }
      .hero-copy { left: 64px; right: 64px; top: 676px; height: 260px; text-align: center; align-items: center; }
      .title { font-size: 82px; }
      .panel { left: 64px; right: 388px; bottom: 86px; min-height: 330px; }
      .character-frame { right: 42px; bottom: 92px; width: 300px; height: 452px; }
    `,
    `
      .card-art { left: auto; right: 70px; top: 150px; width: 430px; height: 645px; transform: rotate(1.2deg); }
      .hero-copy { left: 70px; right: 548px; top: 160px; height: 520px; }
      .panel { left: 70px; right: 548px; bottom: 118px; min-height: 430px; }
      .character-frame { right: 116px; bottom: 88px; width: 292px; height: 392px; }
    `,
  ];
  return variants[layout];
}

function empathyLayoutCss(id) {
  const layout = ((Number(id) || 1) - 1) % 8;
  const variants = [
    `
      .post {
        background:
          radial-gradient(circle at 15% 12%, rgba(52, 211, 153, .32), transparent 28%),
          radial-gradient(circle at 86% 18%, rgba(244, 114, 182, .28), transparent 31%),
          linear-gradient(145deg, #10231e 0%, #141827 46%, #281827 100%);
      }
      .card-art { left: 66px; top: 172px; width: 430px; height: 645px; transform: rotate(-1.2deg); }
      .hero-copy { left: 536px; right: 66px; top: 170px; height: 560px; }
      .hook { font-size: 56px; }
      .panel { left: 66px; right: 416px; bottom: 104px; min-height: 360px; }
      .character-frame { right: 56px; bottom: 94px; width: 312px; height: 474px; }
    `,
    `
      .bg { opacity: .58; filter: blur(7px) saturate(1.2); transform: scale(1.08); }
      .hero-copy { left: 70px; right: 430px; top: 170px; height: 450px; }
      .card-art { left: auto; right: 70px; top: 158px; width: 366px; height: 549px; transform: rotate(2deg); }
      .panel { left: 70px; right: 410px; bottom: 100px; min-height: 450px; }
      .character-frame { right: 82px; bottom: 96px; width: 252px; height: 386px; }
    `,
    `
      .card-art { left: 344px; top: 138px; width: 392px; height: 588px; transform: rotate(.8deg); }
      .hero-copy { left: 74px; right: 74px; top: 744px; height: 256px; text-align: center; align-items: center; }
      .hook { font-size: 58px; }
      .panel { left: 74px; right: 74px; bottom: 86px; min-height: 250px; padding: 30px 42px; text-align: center; }
      .character-frame { right: 62px; top: 172px; bottom: auto; width: 224px; height: 338px; }
    `,
    `
      .card-art { left: 64px; top: 160px; width: 354px; height: 531px; transform: rotate(-2deg); }
      .hero-copy { left: 454px; right: 64px; top: 154px; height: 470px; }
      .panel { left: 454px; right: 64px; bottom: 112px; min-height: 430px; }
      .character-frame { left: 78px; right: auto; bottom: 92px; width: 288px; height: 438px; }
    `,
    `
      .bg { opacity: .62; filter: blur(5px) saturate(1.24); transform: scale(1.06); }
      .hero-copy { left: 72px; right: 72px; top: 160px; height: 430px; }
      .hook { font-size: 64px; }
      .card-art { left: 688px; top: 548px; width: 304px; height: 456px; transform: rotate(3deg); }
      .panel { left: 72px; right: 418px; bottom: 100px; min-height: 440px; }
      .character-frame { right: 64px; top: 170px; bottom: auto; width: 292px; height: 420px; }
    `,
    `
      .card-art { left: 74px; top: 146px; width: 462px; height: 693px; transform: rotate(.5deg); }
      .hero-copy { left: 570px; right: 68px; top: 150px; height: 350px; }
      .panel { left: 570px; right: 68px; bottom: 124px; min-height: 500px; }
      .character-frame { left: 90px; right: auto; bottom: 78px; width: 306px; height: 410px; }
      .footer { left: 570px; }
    `,
    `
      .card-art { left: 380px; top: 150px; width: 340px; height: 510px; transform: rotate(-1deg); }
      .hero-copy { left: 64px; right: 64px; top: 684px; height: 276px; text-align: center; align-items: center; }
      .hook { font-size: 62px; }
      .panel { left: 64px; right: 388px; bottom: 86px; min-height: 320px; }
      .character-frame { right: 42px; bottom: 92px; width: 300px; height: 450px; }
    `,
    `
      .card-art { left: auto; right: 70px; top: 146px; width: 420px; height: 630px; transform: rotate(1.1deg); }
      .hero-copy { left: 70px; right: 532px; top: 156px; height: 520px; }
      .panel { left: 70px; right: 532px; bottom: 118px; min-height: 430px; }
      .character-frame { right: 114px; bottom: 88px; width: 288px; height: 388px; }
    `,
  ];
  return variants[layout];
}

function baseStyles() {
  return `
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      overflow: hidden;
      background: #0d1420;
      font-family: "Yu Gothic", "Meiryo", "Hiragino Kaku Gothic ProN", sans-serif;
      color: #f8fafc;
    }
    .post {
      position: relative;
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      overflow: hidden;
      --paper: rgba(246, 250, 255, .94);
      --panel: rgba(8, 17, 29, .82);
      --line: rgba(255,255,255,.24);
      background:
        radial-gradient(circle at 16% 12%, rgba(252, 211, 77, .34), transparent 31%),
        radial-gradient(circle at 86% 20%, rgba(56, 189, 248, .30), transparent 32%),
        linear-gradient(145deg, #13201d 0%, #101827 44%, #241727 100%);
    }
    .post::after {
      content: "";
      position: absolute;
      inset: 28px;
      border: 1px solid rgba(255,255,255,.16);
      pointer-events: none;
      z-index: 8;
    }
    .bg {
      position: absolute;
      inset: -70px;
      width: calc(100% + 140px);
      height: calc(100% + 140px);
      object-fit: cover;
      opacity: .42;
      filter: blur(18px) saturate(1.16);
      transform: scale(1.06);
    }
    .wash {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(4, 10, 18, .18), rgba(4, 10, 18, .62)),
        linear-gradient(90deg, rgba(4, 10, 18, .18), transparent 38%, rgba(4, 10, 18, .25)),
        repeating-linear-gradient(90deg, rgba(255,255,255,.04) 0 1px, transparent 1px 120px);
      opacity: .98;
    }
    .brand {
      position: absolute;
      left: 62px;
      top: 54px;
      display: flex;
      align-items: center;
      gap: 14px;
      color: #fde68a;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0;
      text-shadow: 0 2px 16px rgba(0,0,0,.42);
      z-index: 10;
    }
    .brand-mark {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: #111827;
      background: linear-gradient(135deg, #fde68a, #f8fafc 48%, #67e8f9);
      box-shadow: 0 12px 28px rgba(0,0,0,.34);
      font-size: 29px;
    }
    .kicker {
      color: #bae6fd;
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 0;
    }
    .number {
      color: rgba(248,250,252,.72);
      font-size: 26px;
      font-weight: 700;
      margin-top: 8px;
    }
    .card-art {
      position: absolute;
      left: 70px;
      top: 178px;
      width: 452px;
      height: 678px;
      padding: 12px;
      margin: 0;
      background: linear-gradient(180deg, rgba(255,255,255,.22), rgba(255,255,255,.06));
      border: 1px solid rgba(255,255,255,.36);
      box-shadow: 0 34px 86px rgba(0,0,0,.50);
      z-index: 3;
    }
    .card-art img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .hero-copy {
      position: absolute;
      left: 560px;
      right: 70px;
      top: 180px;
      height: 520px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 18px;
      text-shadow: 0 2px 18px rgba(0,0,0,.38);
      z-index: 5;
    }
    .name {
      color: rgba(248,250,252,.86);
      font-size: 30px;
      line-height: 1.25;
      font-weight: 900;
      letter-spacing: 0;
    }
    .title {
      color: #fde68a;
      font-size: 76px;
      line-height: 1.06;
      font-weight: 900;
      letter-spacing: 0;
      max-height: 250px;
      overflow: hidden;
    }
    .hook {
      font-size: 54px;
      line-height: 1.15;
      font-weight: 900;
      letter-spacing: 0;
      max-height: 390px;
      overflow: hidden;
    }
    .panel {
      position: absolute;
      left: 70px;
      right: 440px;
      bottom: 112px;
      min-height: 330px;
      padding: 34px 40px 36px;
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: 0 28px 80px rgba(0,0,0,.40);
      backdrop-filter: blur(10px);
      z-index: 6;
    }
    .label {
      color: #67e8f9;
      font-size: 27px;
      font-weight: 900;
      margin-bottom: 14px;
    }
    .message {
      font-size: 38px;
      line-height: 1.36;
      font-weight: 900;
      letter-spacing: 0;
      max-height: 164px;
      overflow: hidden;
    }
    .action {
      margin-top: 22px;
      color: #fde68a;
      font-size: 34px;
      line-height: 1.34;
      font-weight: 900;
      max-height: 112px;
      overflow: hidden;
    }
    .action span {
      display: block;
      color: #bae6fd;
      font-size: 24px;
      margin-bottom: 8px;
    }
    .footer {
      position: absolute;
      left: 64px;
      bottom: 36px;
      color: rgba(248,250,252,.76);
      font-size: 23px;
      font-weight: 700;
      z-index: 10;
    }
    .url {
      position: absolute;
      right: 64px;
      bottom: 36px;
      color: rgba(186,230,253,.84);
      font-size: 22px;
      font-weight: 700;
      z-index: 10;
    }
    .character-frame {
      position: absolute;
      right: 58px;
      bottom: 106px;
      width: 330px;
      height: 500px;
      overflow: hidden;
      background: linear-gradient(180deg, #fffaf0 0%, #eef8ff 100%);
      border: 1px solid rgba(255,255,255,.70);
      border-radius: 190px 190px 34px 34px;
      box-shadow: 0 30px 56px rgba(0,0,0,.38);
      z-index: 4;
    }
    .character {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 18%;
      display: block;
      transform: scale(1.05);
    }
  `;
}

function oracleHtml(card) {
  const imagePath = path.join(ROOT, 'images', 'cards', 'oracle', `${pad2(card.id)}.jpg`);
  const message = oracleVisualMessage(card);
  const action = oracleVisualAction(card);
  return `
    <!doctype html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <style>
        ${baseStyles()}
        ${paletteCss(card.id)}
        ${oracleLayoutCss(card.id)}
      </style>
    </head>
    <body>
      <main class="post oracle-post">
        <img class="bg" src="${fileUrl(imagePath)}" alt="">
        <div class="wash"></div>
        <div class="character-frame"><img class="character" src="${fileUrl(CHARACTER_IMAGE)}" alt=""></div>
        <div class="brand"><span class="brand-mark">R</span><span>羅針占術</span></div>
        <figure class="card-art"><img src="${fileUrl(imagePath)}" alt=""></figure>
        <section class="hero-copy">
          <div>
            <div class="kicker">今日の数秘オラクル</div>
            <div class="number">No.${pad2(card.id)} / ${escapeHtml(card.name)}</div>
          </div>
          <div class="title" data-fit data-min="48">${escapeHtml(card.title)}</div>
          <div class="name">今日の流れを一言で。</div>
        </section>
        <section class="panel">
          <div class="label">カードメッセージ</div>
          <div class="message" data-fit data-min="31">${escapeHtml(message)}</div>
          <div class="action" data-fit data-min="27"><span>今日の一手</span>${escapeHtml(action)}</div>
        </section>
        <div class="footer">保存して、今日の判断軸に。</div>
        <div class="url">rashin-senjutsu.onrender.com</div>
      </main>
    </body>
    </html>
  `;
}

function empathyHtml(item) {
  const imagePath = path.join(ROOT, 'images', 'cards', 'lenormand', `${pad2(item.cardNumber)}.jpg`);
  const reading = empathyVisualReading(item);
  return `
    <!doctype html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <style>
        ${baseStyles()}
        ${paletteCss(item.cardNumber)}
        ${empathyLayoutCss(item.cardNumber)}
      </style>
    </head>
    <body>
      <main class="post empathy-post">
        <img class="bg" src="${fileUrl(imagePath)}" alt="">
        <div class="wash"></div>
        <div class="character-frame"><img class="character" src="${fileUrl(CHARACTER_IMAGE)}" alt=""></div>
        <div class="brand"><span class="brand-mark">R</span><span>羅針占術</span></div>
        <figure class="card-art"><img src="${fileUrl(imagePath)}" alt=""></figure>
        <section class="hero-copy">
          <div>
            <div class="kicker">悩み共感 × ルノルマン</div>
            <div class="number">No.${pad2(item.cardNumber)} / ${escapeHtml(item.cardName)}</div>
          </div>
          <div class="hook" data-fit data-min="38">${escapeHtml(item.hook)}</div>
          <div class="name">この悩み、カードでほどく。</div>
        </section>
        <section class="panel">
          <div class="label">ルノルマンカード「${escapeHtml(item.cardName)}」</div>
          <div class="message" data-fit data-min="31">${escapeHtml(reading)}</div>
          <div class="action" data-fit data-min="27"><span>深掘りしたい人へ</span>羅針占術で、自由記載から整理できます。</div>
        </section>
        <div class="footer">迷いを、次の一手に変える。</div>
        <div class="url">rashin-senjutsu.onrender.com</div>
      </main>
    </body>
    </html>
  `;
}

function staticDifferenceHtml() {
  const imagePath = path.join(ROOT, 'images', 'ui', 'app-icon.png');
  return `
    <!doctype html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <style>
        ${baseStyles()}
        .post {
          background:
            radial-gradient(circle at 18% 12%, rgba(103,232,249,.28), transparent 30%),
            radial-gradient(circle at 82% 18%, rgba(253,230,138,.22), transparent 32%),
            linear-gradient(145deg, #101d22 0%, #151827 46%, #251729 100%);
        }
        .bg { opacity: .18; filter: blur(24px) saturate(1.05); }
        .static-title {
          position: absolute;
          left: 76px;
          right: 330px;
          top: 158px;
          font-size: 86px;
          line-height: 1.04;
          font-weight: 900;
          letter-spacing: 0;
          text-shadow: 0 3px 22px rgba(0,0,0,.42);
        }
        .static-sub {
          color: #bae6fd;
          display: block;
          margin-top: 24px;
          font-size: 38px;
          line-height: 1.35;
          font-weight: 800;
        }
        .feature-list {
          position: absolute;
          left: 76px;
          right: 402px;
          top: 520px;
          display: grid;
          gap: 18px;
        }
        .feature {
          padding: 28px 32px;
          background: rgba(9,19,31,.76);
          border: 1px solid rgba(255,255,255,.22);
          box-shadow: 0 22px 56px rgba(0,0,0,.28);
        }
        .feature h2 {
          margin: 0 0 10px;
          color: #fde68a;
          font-size: 42px;
          line-height: 1.2;
          letter-spacing: 0;
        }
        .feature p {
          margin: 0;
          font-size: 31px;
          line-height: 1.42;
          font-weight: 700;
          letter-spacing: 0;
        }
        .static-character-frame {
          position: absolute;
          right: 54px;
          bottom: 92px;
          width: 330px;
          height: 560px;
          overflow: hidden;
          background: linear-gradient(180deg, #ffffff 0%, #edf8ff 100%);
          border: 1px solid rgba(255,255,255,.72);
          border-radius: 180px 180px 34px 34px;
          box-shadow: 0 30px 52px rgba(0,0,0,.34);
        }
        .static-character {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 16%;
          display: block;
          transform: scale(1.05);
        }
      </style>
    </head>
    <body>
      <main class="post">
        <img class="bg" src="${fileUrl(imagePath)}" alt="">
        <div class="wash"></div>
        <div class="static-character-frame"><img class="static-character" src="${fileUrl(CHARACTER_IMAGE)}" alt=""></div>
        <div class="brand"><span class="brand-mark">R</span><span>羅針占術</span></div>
        <h1 class="static-title">占い結果で<br>終わらせない<span class="static-sub">悩みをそのまま書いて、次に動ける形へ。</span></h1>
        <section class="feature-list">
          <article class="feature"><h2>自由記載</h2><p>選択肢では拾えない悩みも、そのまま整理します。</p></article>
          <article class="feature"><h2>複数占術</h2><p>命式・姓名・動物タイプ・カードを重ねて読みます。</p></article>
          <article class="feature"><h2>次の一手</h2><p>あとで見返せる判断材料として残します。</p></article>
        </section>
        <div class="footer">火曜 20:00</div>
        <div class="url">rashin-senjutsu.onrender.com</div>
      </main>
    </body>
    </html>
  `;
}

function staticFreePaidHtml() {
  const imagePath = path.join(ROOT, 'images', 'ui', 'app-icon.png');
  return `
    <!doctype html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <style>
        ${baseStyles()}
        .post {
          background:
            radial-gradient(circle at 16% 12%, rgba(253,230,138,.28), transparent 30%),
            radial-gradient(circle at 88% 18%, rgba(103,232,249,.24), transparent 32%),
            linear-gradient(145deg, #10221d 0%, #151827 44%, #24172a 100%);
        }
        .bg { opacity: .18; filter: blur(24px) saturate(1.06); }
        .compare-title {
          position: absolute;
          left: 76px;
          right: 340px;
          top: 158px;
          font-size: 78px;
          line-height: 1.04;
          font-weight: 900;
          letter-spacing: 0;
          text-shadow: 0 3px 22px rgba(0,0,0,.42);
        }
        .compare-title span {
          display: block;
          margin-top: 22px;
          color: #bae6fd;
          font-size: 33px;
          line-height: 1.35;
          font-weight: 800;
        }
        .columns {
          position: absolute;
          left: 76px;
          right: 76px;
          top: 508px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
        }
        .column {
          min-height: 590px;
          padding: 34px 34px 38px;
          background: rgba(9,19,31,.76);
          border: 1px solid rgba(255,255,255,.22);
          box-shadow: 0 22px 56px rgba(0,0,0,.28);
        }
        .column h2 {
          margin: 0 0 10px;
          color: #fde68a;
          font-size: 50px;
          line-height: 1.12;
          letter-spacing: 0;
        }
        .column .lead {
          margin: 0 0 30px;
          color: #bae6fd;
          font-size: 32px;
          line-height: 1.35;
          font-weight: 800;
        }
        .column ul {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 22px;
        }
        .column li {
          padding-left: 30px;
          position: relative;
          font-size: 32px;
          line-height: 1.36;
          font-weight: 800;
          letter-spacing: 0;
        }
        .column li::before {
          content: "";
          position: absolute;
          left: 0;
          top: .58em;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #67e8f9;
          box-shadow: 0 0 20px rgba(103,232,249,.72);
        }
        .note {
          position: absolute;
          left: 76px;
          right: 76px;
          bottom: 86px;
          color: #fde68a;
          font-size: 34px;
          line-height: 1.35;
          font-weight: 900;
          text-align: center;
          z-index: 3;
        }
        .compare-character-frame {
          position: absolute;
          right: 64px;
          top: 86px;
          width: 248px;
          height: 306px;
          overflow: hidden;
          background: linear-gradient(180deg, #ffffff 0%, #edf8ff 100%);
          border: 1px solid rgba(255,255,255,.72);
          border-radius: 150px 150px 26px 26px;
          box-shadow: 0 26px 40px rgba(0,0,0,.32);
        }
        .compare-character {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center 12%;
          display: block;
          transform: scale(1.06);
        }
      </style>
    </head>
    <body>
      <main class="post">
        <img class="bg" src="${fileUrl(imagePath)}" alt="">
        <div class="wash"></div>
        <div class="compare-character-frame"><img class="compare-character" src="${fileUrl(CHARACTER_IMAGE)}" alt=""></div>
        <div class="brand"><span class="brand-mark">R</span><span>羅針占術</span></div>
        <h1 class="compare-title">無料で入口。<br>有料で深掘り。<span>必要な人だけ、もう一段具体的に見る設計です。</span></h1>
        <section class="columns">
          <article class="column">
            <h2>無料版</h2>
            <p class="lead">迷いの輪郭を見る入口</p>
            <ul>
              <li>ルノルマン2枚</li>
              <li>数秘オラクル1枚</li>
              <li>本質・本音・現実・次の一手</li>
              <li>軽く整理したい時に向く</li>
            </ul>
          </article>
          <article class="column">
            <h2>有料版</h2>
            <p class="lead">同じ悩みをもう一段深く</p>
            <ul>
              <li>ルノルマン9枚</li>
              <li>数秘オラクル3枚</li>
              <li>追加質問と注意点</li>
              <li>鑑定履歴解析で変化を見る</li>
            </ul>
          </article>
        </section>
        <div class="note">強い購入誘導ではなく、必要な時の選択肢として。</div>
        <div class="footer">土曜 20:00</div>
        <div class="url">rashin-senjutsu.onrender.com</div>
      </main>
    </body>
    </html>
  `;
}

async function ensureImagesLoaded(page) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map(image => {
      if (image.complete) return null;
      return new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }));
  });
}

async function fitText(page) {
  await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('[data-fit]'));
    boxes.forEach(box => {
      const min = Number(box.getAttribute('data-min') || '24');
      let size = parseFloat(getComputedStyle(box).fontSize);
      while ((box.scrollHeight > box.clientHeight || box.scrollWidth > box.clientWidth) && size > min) {
        size -= 1;
        box.style.fontSize = `${size}px`;
      }
    });
  });
}

async function renderHtml(page, html, outPath, quality) {
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await page.setContent(html, { waitUntil: 'load' });
  await ensureImagesLoaded(page);
  await fitText(page);
  const post = page.locator('.post');
  await post.screenshot({ path: outPath, type: 'jpeg', quality });
}

async function generateOracle(page, quality) {
  const messages = await loadDailyOracleMessages();
  for (const card of messages) {
    const outPath = path.join(OUT_ROOT, 'oracle', `${pad2(card.id)}.jpg`);
    await renderHtml(page, oracleHtml(card), outPath, quality);
  }
  return messages.length;
}

async function generateEmpathy(page, quality) {
  for (const item of LENORMAND_EMPATHY_POSTS) {
    const outPath = path.join(OUT_ROOT, 'lenormand-empathy', `${pad2(item.cardNumber)}.jpg`);
    await renderHtml(page, empathyHtml(item), outPath, quality);
  }
  return LENORMAND_EMPATHY_POSTS.length;
}

async function generateStatic(page, quality) {
  await renderHtml(page, staticDifferenceHtml(), path.join(OUT_ROOT, 'difference.jpg'), quality);
  await renderHtml(page, staticFreePaidHtml(), path.join(OUT_ROOT, 'free-paid-compare.jpg'), quality);
  return 2;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const summary = {
    outputDir: OUT_ROOT,
    oracle: 0,
    empathy: 0,
    static: 0,
  };
  try {
    if (args.kind === 'all' || args.kind === 'oracle') summary.oracle = await generateOracle(page, args.quality);
    if (args.kind === 'all' || args.kind === 'empathy') summary.empathy = await generateEmpathy(page, args.quality);
    if (args.kind === 'all' || args.kind === 'static') summary.static = await generateStatic(page, args.quality);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ generated: summary, size: { width: WIDTH, height: HEIGHT } }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
