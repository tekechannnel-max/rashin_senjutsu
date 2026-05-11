const fs = require('fs/promises');
const http = require('http');

const {
  TOKEN_FILE,
  buildThreadsAuthUrl,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  getThreadsCredentials,
  getThreadsMe,
  saveStoredToken,
  postTextToThreads,
  postImageToThreads,
  sanitizeTokenResult,
  ensureThreadsText,
  ensurePublicMediaUrl,
  normalizeThreadsAltText,
} = require('./threads-client');

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

function getCodeOption(options) {
  if (options.code) return options.code;
  if (options.url) {
    const parsed = new URL(options.url);
    const code = parsed.searchParams.get('code');
    if (code) return code;
    throw new Error('The provided --url does not include a code query parameter.');
  }
  throw new Error('Missing --code or --url');
}

function isLocalCallbackHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
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
  throw new Error('Real posting requires --yes or SOCIAL_AUTOMATED_POSTING_ENABLED=true.');
}

async function saveTokenFromCode(code, flags) {
  const shortLived = await exchangeCodeForShortLivedToken(code);
  const longLived = flags.has('short') ? shortLived : await exchangeForLongLivedToken(shortLived.access_token);
  const tokenRecord = {
    access_token: longLived.access_token,
    token_type: longLived.token_type,
    expires_in: longLived.expires_in,
    user_id: shortLived.user_id,
    source: flags.has('short') ? 'short_lived' : 'long_lived',
  };
  return saveStoredToken(tokenRecord);
}

async function runConnect(flags) {
  const redirectUri = process.env.THREADS_REDIRECT_URI || 'http://localhost:3000/auth/threads/callback';
  const parsed = new URL(redirectUri);
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  const callbackPath = parsed.pathname;
  const authUrl = buildThreadsAuthUrl();

  console.log('Open this URL in your browser:');
  console.log(authUrl);
  console.log('');

  if (!isLocalCallbackHost(parsed.hostname)) {
    console.log(`Your redirect URI is public HTTPS: ${redirectUri}`);
    console.log('After approval, copy the full callback URL or the command shown on the callback page.');
    console.log('');
    console.log('Fallback command format:');
    console.log('node scripts/social/threads-tool.js exchange --url="<full-callback-url>"');
    return;
  }

  console.log(`Waiting for Threads callback on ${redirectUri}`);

  await new Promise((resolve, reject) => {
    let completed = false;
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, redirectUri);
        console.log(`Callback request: ${reqUrl.pathname}${reqUrl.search || ''}`);
        if (reqUrl.pathname !== callbackPath) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        const oauthError = reqUrl.searchParams.get('error')
          || reqUrl.searchParams.get('error_message')
          || reqUrl.searchParams.get('error_reason')
          || reqUrl.searchParams.get('error_description');
        if (oauthError) throw new Error(`Threads OAuth error: ${oauthError}`);
        const code = reqUrl.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<!doctype html><meta charset="utf-8"><title>No Threads code</title><body>No code was received. Keep PowerShell open, return to PowerShell, and open the printed Threads authorization URL again.</body>');
          console.log('No code was received. Keep this command running and open the printed authorization URL again.');
          return;
        }
        const saved = await saveTokenFromCode(code, flags);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta charset="utf-8"><title>Threads connected</title><body>Threads connected. You can close this tab and return to PowerShell.</body>');
        print({
          saved_to: TOKEN_FILE,
          token: sanitizeTokenResult(saved),
          next_step: 'Run npm run threads:doctor.',
        });
        completed = true;
        server.close(resolve);
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(error?.message || String(error));
        server.close(() => reject(error));
      }
    });
    server.on('error', reject);
    server.listen(port, parsed.hostname);
    setTimeout(() => {
      if (completed) return;
      server.close(() => reject(new Error('Timed out waiting for Threads OAuth callback. Run npm run threads:connect again.')));
    }, 5 * 60 * 1000);
  });
}

async function runDoctor() {
  const credentials = await getThreadsCredentials();
  const report = {
    target_account: process.env.THREADS_EXPECTED_USERNAME || 'not set',
    token_file: TOKEN_FILE,
    has_access_token: Boolean(credentials.accessToken),
    user_id: credentials.userId || 'not set',
    next_step: null,
  };
  if (!process.env.THREADS_EXPECTED_USERNAME) {
    report.next_step = 'Set THREADS_EXPECTED_USERNAME=sensai_teke before posting.';
  }
  if (!credentials.accessToken) {
    report.next_step = 'Create a Meta Threads app, then run npm run threads:auth-url.';
    print(report);
    return;
  }
  const me = await getThreadsMe(credentials);
  report.me = {
    id: me.id,
    username: me.username,
    name: me.name,
  };
  report.next_step = 'Token works. Use npm run social:threads:post for a draft, or npm run social:post with SOCIAL_PLATFORMS=threads.';
  print(report);
}

async function runExchange(options, flags) {
  const saved = await saveTokenFromCode(getCodeOption(options), flags);
  print({
    saved_to: TOKEN_FILE,
    token: sanitizeTokenResult(saved),
    next_step: 'Run npm run threads:doctor and confirm the username is @sensai_teke.',
  });
}

async function runRefresh() {
  const credentials = await getThreadsCredentials();
  if (!credentials.accessToken) throw new Error('No Threads token found.');
  const refreshed = await refreshLongLivedToken(credentials.accessToken);
  const saved = await saveStoredToken({
    access_token: refreshed.access_token,
    token_type: refreshed.token_type,
    expires_in: refreshed.expires_in,
  });
  print({
    saved_to: TOKEN_FILE,
    token: sanitizeTokenResult(saved),
  });
}

async function runSaveToken(options) {
  const accessToken = requireOption(options, 'token');
  const credentials = { accessToken, userId: 'me' };
  const me = await getThreadsMe(credentials);
  const saved = await saveStoredToken({
    access_token: accessToken,
    user_id: me.id,
    username: me.username,
    source: 'user_token_generator',
  });
  print({
    saved_to: TOKEN_FILE,
    account: {
      id: me.id,
      username: me.username,
      name: me.name,
    },
    token: sanitizeTokenResult(saved),
    next_step: 'Run npm run threads:doctor.',
  });
}

async function runPostText(options, flags) {
  const text = ensureThreadsText(await readText(options));
  if (flags.has('dry-run')) {
    print({ dry_run: true, text, characters: [...text].length });
    return;
  }
  requirePostingConfirmation(flags);
  const result = await postTextToThreads({ text });
  print({ posted: result });
}

async function runPostImage(options, flags) {
  const text = ensureThreadsText(await readText(options));
  const imageUrl = ensurePublicMediaUrl(requireOption(options, 'image-url'));
  const altText = normalizeThreadsAltText(await readOptionalAltText(options));
  if (flags.has('dry-run')) {
    print({ dry_run: true, text, image_url: imageUrl, alt_text: altText, characters: [...text].length });
    return;
  }
  requirePostingConfirmation(flags);
  const result = await postImageToThreads({ text, imageUrl, altText });
  print({ posted: result });
}

async function main() {
  const { command, options, flags } = parseArgs(process.argv.slice(2));
  if (command === 'auth-url') {
    console.log(buildThreadsAuthUrl());
    return;
  }
  if (command === 'connect') {
    await runConnect(flags);
    return;
  }
  if (command === 'exchange') {
    await runExchange(options, flags);
    return;
  }
  if (command === 'refresh') {
    await runRefresh();
    return;
  }
  if (command === 'save-token') {
    await runSaveToken(options);
    return;
  }
  if (command === 'me') {
    print(await getThreadsMe());
    return;
  }
  if (command === 'post-text') {
    await runPostText(options, flags);
    return;
  }
  if (command === 'post-image') {
    await runPostImage(options, flags);
    return;
  }
  if (command === 'doctor') {
    await runDoctor();
    return;
  }
  throw new Error(`Unknown threads command: ${command}`);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
