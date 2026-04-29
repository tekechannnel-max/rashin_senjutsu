# SNS daily posting

This folder contains the daily posting helper for the limited prerelease.

## What it does

- Picks one numerology oracle card from `1` to `33`.
- Creates the 7:00 daily oracle post text with the matching card image.
- Creates one lightweight concept post for the same day.
- Writes a JSON draft under `data/social-posts/` when `--write` is used.
- Posts to X and Threads only when API credentials are present and `--post` is used.
- Runs due daily posts with `run-scheduled-posts.js`.

`data/` is gitignored, so generated drafts and state are not committed.

## Compliance note

X automation should use the official API. Do not use browser automation to script the X website for posting.

For an automated X account, enable the automated account label and make the account bio clear about who operates it. Keep posts non-duplicative, avoid unsolicited mentions/replies/DMs, and keep the volume low.

## Dry run

```powershell
npm run social:draft
```

## Write today's draft

```powershell
npm run social:write
```

## Post

```powershell
npm run social:post
```

You can limit platforms:

```powershell
node scripts/social/daily-oracle-post.js --write --post --platforms=x
node scripts/social/daily-oracle-post.js --write --post --platforms=threads
```

You can limit the post kind:

```powershell
node scripts/social/daily-oracle-post.js --write --post --kind=oracle
node scripts/social/daily-oracle-post.js --write --post --kind=concept
```

## Required environment variables for posting

X:

```env
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
```

Threads:

```env
THREADS_USER_ID=
THREADS_ACCESS_TOKEN=
THREADS_PUBLISH_WAIT_MS=30000
```

Shared:

```env
PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com
SOCIAL_AUTOMATED_POSTING_ENABLED=true
SOCIAL_PLATFORMS=x,threads
SOCIAL_ORACLE_TIME=07:00
SOCIAL_CONCEPT_TIME=20:00
```

## Scheduling

Use Windows Task Scheduler, GitHub Actions schedule, or a small Render Cron Job.

Recommended split:

- `07:00 Asia/Tokyo`: oracle image post
- `20:00 Asia/Tokyo`: concept post

Run a dry check:

```powershell
node scripts/social/run-scheduled-posts.js --dry-run
```

Run once and post anything due today:

```powershell
npm run social:run-due
```

Run as a long-lived local process:

```powershell
npm run social:daemon
```

Force a post manually:

```powershell
node scripts/social/run-scheduled-posts.js --force-kind=oracle
node scripts/social/run-scheduled-posts.js --force-kind=concept
```

The scheduler writes `data/social-posts/scheduled-post-state.json` and will not post the same kind twice on the same JST date after a successful post.
