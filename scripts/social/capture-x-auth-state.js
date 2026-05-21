const fs = require('fs/promises');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, '.tmp-x-auth-state.json');

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    timeoutMs: 10 * 60 * 1000,
    url: 'https://x.com/home',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[++i] || args.out;
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length) || args.out;
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    else if (arg.startsWith('--timeout-ms=')) args.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--url') args.url = argv[++i] || args.url;
    else if (arg.startsWith('--url=')) args.url = arg.slice('--url='.length) || args.url;
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 30000) {
    throw new Error(`Invalid --timeout-ms: ${args.timeoutMs}`);
  }
  args.out = path.resolve(ROOT, args.out);
  return args;
}

async function waitForLoggedIn(page, timeoutMs) {
  const loggedIn = page.locator([
    '[data-testid="SideNav_NewTweet_Button"]',
    '[data-testid="AppTabBar_Home_Link"]',
    'a[href="/compose/post"]',
    'a[href="/compose/tweet"]',
  ].join(', ')).first();
  await loggedIn.waitFor({ state: 'visible', timeout: timeoutMs });
  const url = page.url();
  if (/\/login|\/i\/flow\/login/.test(url)) {
    throw new Error('X login did not complete.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  console.log('Log in to X in the opened browser window. This command saves only the browser storage state; it does not post.');
  await waitForLoggedIn(page, args.timeoutMs);

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await context.storageState({ path: args.out });
  await browser.close();

  console.log(JSON.stringify({
    status: 'x_auth_state_saved',
    storageStatePath: path.relative(ROOT, args.out).replace(/\\/g, '/'),
    nextStep: 'Base64-encode this file and save it as GitHub Actions secret X_AUTH_STORAGE_BASE64.',
  }, null, 2));
}

main().catch(async error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
