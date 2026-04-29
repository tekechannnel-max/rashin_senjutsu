const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const APP_JS = path.join(ROOT, 'app.js');
const OUT_DIR = path.join(ROOT, 'data', 'social-posts');
const STATE_FILE = path.join(OUT_DIR, 'daily-oracle-state.json');
const DEFAULT_PUBLIC_ORIGIN = 'https://rashin-senjutsu.onrender.com';

const CONCEPT_POSTS = [
  '羅針占術は、カードだけで答えを決める占いではありません。姓名判断・四柱推命・動物タイプ診断で土台を見て、カードで「いまの現実」と「次の一手」を読みます。',
  '迷っているときほど、正解探しより「自分が何を大事にしたいか」を見失いやすい。羅針占術は、その軸を取り戻すための占いとして作っています。',
  '無料鑑定では、本質・本音・現実・次の一手までを読みます。深掘り鑑定では、同じ相談を追加カードと履歴の流れまで含めて細かく見ます。',
  '羅針占術で大事にしているのは、「当たった」で終わらせないこと。読み終わったあとに、今日何を確認するか、どう動くかまで残る鑑定を目指しています。',
  'カードは未来を固定するものではなく、今の状態を映す鏡として使っています。見えた流れをもとに、選び方を整えるための占いです。',
  '悩みが深いときほど、気持ちだけでも、理屈だけでも決めにくい。羅針占術では、生まれ・名前・行動傾向・カードを重ねて判断材料を増やします。',
  '「進むか、止まるか、様子を見るか」。羅針占術では、曖昧な不安をそのままにせず、次に取れる一手まで言葉にします。',
  '占いを、依存ではなく自己理解の道具にする。羅針占術は、そんな距離感で使えるWeb占いとして育てています。',
];

function parseArgs(argv) {
  const args = { dryRun: false, write: false, post: false, platforms: ['x', 'threads'], kind: 'all' };
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

function buildOracleText(card, publicOrigin) {
  const shareUrl = `${publicOrigin}/share/card?type=oracle&id=${encodeURIComponent(card.id)}`;
  return [
    `今日の数秘オラクル：${card.name}`,
    '',
    card.title,
    '',
    card.message,
    '',
    `今日の一手：${card.action}`,
    '',
    shareUrl,
    '',
    '#羅針占術 #今日のオラクル #数秘オラクル',
  ].join('\n');
}

function buildConceptText(dateKey) {
  const index = crypto.createHash('sha256').update(dateKey).digest()[0] % CONCEPT_POSTS.length;
  return [
    CONCEPT_POSTS[index],
    '',
    '迷いを、次の一手に変える占い。',
    DEFAULT_PUBLIC_ORIGIN,
    '',
    '#羅針占術 #占い #自己理解',
  ].join('\n');
}

async function buildDraft(args) {
  const dateKey = args.date || getJstDateString();
  const publicOrigin = (process.env.PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, '');
  const messages = await loadDailyOracleMessages();
  const card = await pickCard(messages, dateKey, args.write || args.post);
  const imageName = `${String(card.id).padStart(2, '0')}.jpg`;
  const draft = {
    date: dateKey,
    schedule: {
      oracle: '07:00 Asia/Tokyo',
      concept: '12:00 Asia/Tokyo',
    },
    oracle: {
      card,
      imagePath: path.join(ROOT, 'images', 'cards', 'oracle', imageName),
      imageUrl: `${publicOrigin}/images/cards/oracle/${imageName}`,
      text: buildOracleText(card, publicOrigin),
    },
    concept: {
      text: buildConceptText(dateKey),
    },
  };
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

async function postToThreads(text, imageUrl) {
  const required = ['THREADS_ACCESS_TOKEN', 'THREADS_USER_ID'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing Threads credentials: ${missing.join(', ')}`);
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  const createUrl = `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`;
  const createBody = new URLSearchParams({
    media_type: 'IMAGE',
    image_url: imageUrl,
    text,
    access_token: token,
  });
  const createRes = await fetch(createUrl, { method: 'POST', body: createBody });
  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(`Threads container failed: ${createRes.status} ${JSON.stringify(createJson)}`);
  const waitMs = Number(process.env.THREADS_PUBLISH_WAIT_MS || 30000);
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  const publishUrl = `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads_publish`;
  const publishBody = new URLSearchParams({
    creation_id: createJson.id,
    access_token: token,
  });
  const publishRes = await fetch(publishUrl, { method: 'POST', body: publishBody });
  const publishJson = await publishRes.json().catch(() => ({}));
  if (!publishRes.ok) throw new Error(`Threads publish failed: ${publishRes.status} ${JSON.stringify(publishJson)}`);
  return publishJson;
}

async function postTextToThreads(text) {
  const required = ['THREADS_ACCESS_TOKEN', 'THREADS_USER_ID'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing Threads credentials: ${missing.join(', ')}`);
  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  const createUrl = `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads`;
  const createBody = new URLSearchParams({
    media_type: 'TEXT',
    text,
    access_token: token,
  });
  const createRes = await fetch(createUrl, { method: 'POST', body: createBody });
  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(`Threads text container failed: ${createRes.status} ${JSON.stringify(createJson)}`);
  const publishUrl = `https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads_publish`;
  const publishBody = new URLSearchParams({
    creation_id: createJson.id,
    access_token: token,
  });
  const publishRes = await fetch(publishUrl, { method: 'POST', body: publishBody });
  const publishJson = await publishRes.json().catch(() => ({}));
  if (!publishRes.ok) throw new Error(`Threads text publish failed: ${publishRes.status} ${JSON.stringify(publishJson)}`);
  return publishJson;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const draft = await buildDraft(args);
  console.log(JSON.stringify(draft, null, 2));
  if (!args.post) return;
  const results = {};
  if (args.platforms.includes('x')) {
    if (args.kind === 'all' || args.kind === 'oracle') results.xOracle = await postToX(draft.oracle.text, draft.oracle.imagePath);
    if (args.kind === 'all' || args.kind === 'concept') results.xConcept = await postTextToX(draft.concept.text);
  }
  if (args.platforms.includes('threads')) {
    if (args.kind === 'all' || args.kind === 'oracle') results.threadsOracle = await postToThreads(draft.oracle.text, draft.oracle.imageUrl);
    if (args.kind === 'all' || args.kind === 'concept') results.threadsConcept = await postTextToThreads(draft.concept.text);
  }
  console.log(JSON.stringify({ posted: results }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
