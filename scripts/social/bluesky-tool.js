const fs = require('fs/promises');

const {
  IMAGE_LIMIT_BYTES,
  getBlueskyCredentials,
  createSession,
  assertExpectedBlueskyAccount,
  postImageToBluesky,
  sanitizeSession,
  ensureBlueskyText,
  normalizeAltText,
} = require('./bluesky-client');

function parseArgs(argv) {
  const args = { command: argv[0] || 'doctor', options: {}, flags: new Set() };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const raw = arg.slice(2);
    if (raw.includes('=')) {
      const [key, ...rest] = raw.split('=');
      args.options[key] = rest.join('=');
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.options[raw] = next;
        i += 1;
      } else {
        args.flags.add(raw);
      }
    }
  }
  return args;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

async function readText(options) {
  if (options.text) return options.text;
  if (options.file) return fs.readFile(options.file, 'utf8');
  throw new Error('Missing --text or --file');
}

async function readOptionalAltText(options) {
  if (options['alt-text']) return options['alt-text'];
  if (options['alt-file']) return fs.readFile(options['alt-file'], 'utf8');
  return '';
}

function requirePostingConfirmation(flags) {
  if (flags.has('yes')) return;
  if (process.env.SOCIAL_AUTOMATED_POSTING_ENABLED === 'true') return;
  throw new Error('Real Bluesky posting requires --yes or SOCIAL_AUTOMATED_POSTING_ENABLED=true.');
}

async function runDoctor() {
  const credentials = getBlueskyCredentials();
  const report = {
    service: credentials.service,
    public_appview: credentials.publicAppView,
    target_account: credentials.expectedHandle || 'not set',
    has_identifier: Boolean(credentials.identifier),
    has_app_password: Boolean(credentials.password),
    image_limit_bytes: IMAGE_LIMIT_BYTES,
    next_step: null,
  };
  if (!credentials.expectedHandle) {
    report.next_step = 'Set BLUESKY_EXPECTED_HANDLE=tekesensai.bsky.social before posting.';
  }
  if (!credentials.identifier || !credentials.password) {
    report.next_step = 'Set BLUESKY_IDENTIFIER=tekesensai.bsky.social and BLUESKY_APP_PASSWORD in Render or .env.';
    print(report);
    return;
  }
  const session = await createSession(credentials);
  await assertExpectedBlueskyAccount(session, credentials);
  report.session = sanitizeSession(session);
  report.next_step = 'Bluesky credentials work. Use npm run social:bluesky:post or SOCIAL_PLATFORMS=threads,bluesky npm run social:post.';
  print(report);
}

async function runPostImage(options, flags) {
  const text = ensureBlueskyText(await readText(options));
  const imagePath = requireOption(options, 'image');
  const altText = normalizeAltText(await readOptionalAltText(options));
  if (flags.has('dry-run')) {
    print({ dry_run: true, text, image: imagePath, alt_text: altText, characters: [...text].length });
    return;
  }
  requirePostingConfirmation(flags);
  const result = await postImageToBluesky({ text, imagePath, altText });
  print({ posted: result });
}

async function main() {
  const { command, options, flags } = parseArgs(process.argv.slice(2));
  if (command === 'doctor') {
    await runDoctor();
    return;
  }
  if (command === 'post-image') {
    await runPostImage(options, flags);
    return;
  }
  throw new Error(`Unknown bluesky command: ${command}`);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
