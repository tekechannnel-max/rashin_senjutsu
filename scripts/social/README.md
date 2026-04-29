# SNS daily posting

This folder contains the daily posting helper for the limited prerelease.

## What it does

- Picks one numerology oracle card from `1` to `33`.
- Creates the 7:00 daily oracle post text with the matching card image.
- Creates one lightweight concept post for the same day.
- Writes a JSON draft under `data/social-posts/` when `--write` is used.
- Posts to X and Threads only when API credentials are present and `--post` is used.

`data/` is gitignored, so generated drafts and state are not committed.

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
```

## Scheduling

Use Windows Task Scheduler, GitHub Actions schedule, or a small Render Cron Job.

Recommended split:

- `07:00 Asia/Tokyo`: `node scripts/social/daily-oracle-post.js --write --post --kind=oracle`
- `12:00 or 20:00 Asia/Tokyo`: `node scripts/social/daily-oracle-post.js --write --post --kind=concept`

The current script posts both when `--post` is used without `--kind`.
