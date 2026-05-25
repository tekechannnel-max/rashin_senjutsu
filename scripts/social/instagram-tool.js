const fs = require('fs/promises');

const {
  INSTAGRAM_CHARACTER_LIMIT,
  getInstagramCredentials,
  resolveInstagramUserId,
  getInstagramMe,
  postImageToInstagram,
  ensureInstagramCaption,
  ensurePublicImageUrl,
  normalizeAltText,
} = require('./instagram-client');

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
  throw new Error('Real Instagram posting requires --yes or SOCIAL_AUTOMATED_POSTING_ENABLED=true.');
}

async function runDoctor() {
  const credentials = getInstagramCredentials();
  const report = {
    target_account: process.env.INSTAGRAM_EXPECTED_USERNAME || 'not set',
    graph_base: credentials.graphBase,
    has_access_token: Boolean(credentials.accessToken),
    user_id: credentials.userId || 'not set',
    caption_limit: INSTAGRAM_CHARACTER_LIMIT,
    next_step: null,
  };
  if (!process.env.INSTAGRAM_EXPECTED_USERNAME) {
    report.next_step = 'Set INSTAGRAM_EXPECTED_USERNAME=sensai_teke before posting.';
  }
  if (!credentials.accessToken) {
    report.next_step = 'Set INSTAGRAM_ACCESS_TOKEN in Render or .env.';
    print(report);
    return;
  }
  const me = await getInstagramMe(credentials);
  const resolvedUserId = await resolveInstagramUserId(credentials);
  report.me = {
    id: me.id,
    username: me.username,
    account_type: me.account_type,
    media_count: me.media_count,
  };
  report.resolved_user_id = resolvedUserId;
  if (!report.next_step) {
    report.next_step = 'Token works. Use npm run social:instagram:draft first, then post after review.';
  }
  print(report);
}

async function runPostImage(options, flags) {
  const text = ensureInstagramCaption(await readText(options));
  const imageUrl = ensurePublicImageUrl(requireOption(options, 'image-url'));
  const altText = normalizeAltText(await readOptionalAltText(options));
  if (flags.has('dry-run')) {
    print({ dry_run: true, text, image_url: imageUrl, alt_text: altText, characters: [...text].length });
    return;
  }
  requirePostingConfirmation(flags);
  const result = await postImageToInstagram({ text, imageUrl, altText });
  print({ posted: result });
}

async function main() {
  const { command, options, flags } = parseArgs(process.argv.slice(2));
  if (command === 'doctor') return runDoctor();
  if (command === 'post-image') return runPostImage(options, flags);
  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
