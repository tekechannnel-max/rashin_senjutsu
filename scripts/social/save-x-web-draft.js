const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');
const { exportXDrafts } = require('./export-x-drafts');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(ROOT, '.tmp-x-web-drafts');
const SOCIAL_POST_KINDS = ['oracle'];

function parseArgs(argv) {
  const args = {
    date: 'today',
    kind: 'oracle',
    out: DEFAULT_OUT_DIR,
    headless: true,
    attachImage: true,
    requireSavePrompt: true,
    requireAlt: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') args.date = argv[++i] || args.date;
    else if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length) || args.date;
    else if (arg === '--kind') args.kind = argv[++i] || args.kind;
    else if (arg.startsWith('--kind=')) args.kind = arg.slice('--kind='.length) || args.kind;
    else if (arg === '--out') args.out = argv[++i] || args.out;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length) || args.out;
    else if (arg === '--storage-state') args.storageState = argv[++i] || args.storageState;
    else if (arg.startsWith('--storage-state=')) args.storageState = arg.slice('--storage-state='.length) || args.storageState;
    else if (arg === '--headed') args.headless = false;
    else if (arg === '--headless') args.headless = true;
    else if (arg === '--no-image') args.attachImage = false;
    else if (arg === '--allow-no-save-prompt') args.requireSavePrompt = false;
    else if (arg === '--require-alt') args.requireAlt = true;
    else if (arg === '--dry-run') args.dryRun = true;
  }
  if (args.date === 'today') args.date = getJstDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error(`Invalid --date: ${args.date}`);
  if (!['all', ...SOCIAL_POST_KINDS].includes(args.kind)) throw new Error(`Invalid --kind: ${args.kind}`);
  args.out = path.resolve(ROOT, args.out);
  if (args.storageState) args.storageState = path.resolve(ROOT, args.storageState);
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

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readStorageState(args) {
  if (args.storageState) return readJson(args.storageState);
  const base64 = String(process.env.X_AUTH_STORAGE_BASE64 || '').trim();
  if (base64) return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  const rawJson = String(process.env.X_AUTH_STORAGE_JSON || '').trim();
  if (rawJson) return JSON.parse(rawJson);
  throw new Error('Missing X auth storage. Set X_AUTH_STORAGE_BASE64, X_AUTH_STORAGE_JSON, or pass --storage-state=.tmp-x-auth-state.json.');
}

async function exportDraftEntries(args) {
  await fs.rm(args.out, { recursive: true, force: true });
  await fs.mkdir(args.out, { recursive: true });
  const report = await exportXDrafts({
    date: args.date,
    kind: args.kind,
    out: args.out,
    due: false,
  });
  if (report.status !== 'x_drafts_written') return { report, entries: [] };
  const entries = [];
  for (const item of report.entries || []) {
    entries.push(await readJson(path.join(ROOT, item.files.json)));
  }
  return { report, entries };
}

async function firstVisible(locators, timeoutMs = 2000) {
  for (const locator of locators) {
    try {
      const first = locator.first();
      await first.waitFor({ state: 'visible', timeout: timeoutMs });
      return first;
    } catch {
      // Try the next selector.
    }
  }
  return null;
}

function composeLocators(page) {
  return [
    page.locator('[data-testid="tweetTextarea_0"]'),
    page.locator('div[role="textbox"][contenteditable="true"]'),
    page.locator('[aria-label="Post text"]'),
    page.locator('[aria-label="ポスト本文"]'),
    page.locator('[aria-label="ツイート本文"]'),
  ];
}

async function ensureLoggedIn(page) {
  if (/\/login|\/i\/flow\/login/.test(page.url())) {
    throw new Error('X redirected to login. Refresh X_AUTH_STORAGE_BASE64.');
  }
  const loginLink = await firstVisible([
    page.getByRole('link', { name: /^Log in$/i }),
    page.getByRole('button', { name: /^Log in$/i }),
    page.getByRole('button', { name: /^ログイン$/ }),
  ], 1000);
  if (loginLink) throw new Error('X is showing a login prompt. Refresh X_AUTH_STORAGE_BASE64.');
}

async function fillComposeText(page, text) {
  const compose = await firstVisible(composeLocators(page), 20000);
  if (!compose) throw new Error('Could not find X compose textbox.');
  await compose.click();
  await page.keyboard.insertText(text);
  await page.waitForTimeout(500);
  const rendered = await compose.innerText().catch(() => '');
  const firstLine = String(text).split('\n').find(Boolean) || '';
  if (firstLine && !rendered.includes(firstLine)) {
    throw new Error('X compose textbox did not contain the generated text after insertion.');
  }
}

async function attachImage(page, entry) {
  const imagePath = path.resolve(ROOT, entry.imagePath);
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(imagePath, { timeout: 15000 });
  await page.waitForTimeout(2500);
}

async function tryAddAltText(page, altText) {
  const opener = await firstVisible([
    page.getByRole('button', { name: /Add description|Edit description|説明を追加|説明を編集|代替テキスト|ALT/i }),
    page.locator('[data-testid="altTextLabel"]'),
  ], 2500);
  if (!opener) return false;
  await opener.click();
  const altBox = await firstVisible([
    page.locator('textarea').last(),
    page.locator('div[role="textbox"][contenteditable="true"]').last(),
  ], 5000);
  if (!altBox) return false;
  await altBox.click();
  await page.keyboard.insertText(altText);
  const done = await firstVisible([
    page.getByRole('button', { name: /^Save$/i }),
    page.getByRole('button', { name: /^Done$/i }),
    page.getByRole('button', { name: /^保存$/ }),
    page.getByRole('button', { name: /^完了$/ }),
  ], 5000);
  if (!done) return false;
  await done.click();
  await page.waitForTimeout(500);
  return true;
}

async function saveOpenDraft(page, args) {
  const close = await firstVisible([
    page.locator('[data-testid="app-bar-close"]'),
    page.getByRole('button', { name: /^Close$/i }),
    page.getByRole('button', { name: /^閉じる$/ }),
    page.locator('[aria-label="Close"]'),
    page.locator('[aria-label="閉じる"]'),
  ], 5000);
  if (!close) throw new Error('Could not find X compose close button.');
  await close.click();
  const save = await firstVisible([
    page.getByRole('button', { name: /^Save$/i }),
    page.getByRole('button', { name: /Save draft/i }),
    page.getByRole('button', { name: /^保存$/ }),
    page.getByRole('button', { name: /下書き/ }),
    page.locator('text=/^(Save|保存)$/'),
  ], 5000);
  if (!save) {
    if (args.requireSavePrompt) throw new Error('X did not show a Save draft prompt.');
    return false;
  }
  await save.click();
  await page.waitForTimeout(1000);
  return true;
}

async function saveEntry(page, entry, args) {
  await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await ensureLoggedIn(page);
  await fillComposeText(page, entry.text);
  let imageAttached = false;
  let altApplied = false;
  if (args.attachImage) {
    await attachImage(page, entry);
    imageAttached = true;
    altApplied = await tryAddAltText(page, entry.altText);
    if (args.requireAlt && !altApplied) throw new Error('Image was attached, but alt text could not be applied.');
  }
  const saveClicked = await saveOpenDraft(page, args);
  const screenshotPath = path.join(args.out, `${entry.date}-${entry.kind}-saved.png`);
  await fs.mkdir(args.out, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return {
    date: entry.date,
    kind: entry.kind,
    characterCount: entry.characterCount,
    oracleCard: entry.oracleCard || null,
    imageAttached,
    altApplied,
    saveClicked,
    screenshot: rel(screenshotPath),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { report, entries } = await exportDraftEntries(args);
  if (!entries.length || args.dryRun) {
    console.log(JSON.stringify({
      status: args.dryRun ? 'x_web_draft_dry_run' : 'no_x_web_drafts',
      exportStatus: report.status,
      entries: entries.map(entry => ({ date: entry.date, kind: entry.kind, characterCount: entry.characterCount })),
    }, null, 2));
    return;
  }

  const storageState = await readStorageState(args);
  const browser = await chromium.launch({
    headless: args.headless,
    args: ['--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    storageState,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const blockedPosts = [];
  await page.route('**/*', route => {
    const request = route.request();
    const url = request.url();
    if (request.method() !== 'GET' && /(CreateTweet|\/2\/tweets|statuses\/update)/.test(url)) {
      blockedPosts.push(url);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  const saved = [];
  try {
    for (const entry of entries) {
      saved.push(await saveEntry(page, entry, args));
    }
  } catch (error) {
    const screenshotPath = path.join(args.out, 'x-web-draft-error.png');
    await fs.mkdir(args.out, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    throw new Error(`${error.message}\nDebug screenshot: ${rel(screenshotPath)}`);
  } finally {
    await browser.close();
  }

  if (blockedPosts.length) {
    throw new Error(`Blocked unexpected X post request: ${blockedPosts.join(', ')}`);
  }

  console.log(JSON.stringify({
    status: 'x_web_drafts_saved',
    outputDir: rel(args.out),
    entries: saved,
  }, null, 2));
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
