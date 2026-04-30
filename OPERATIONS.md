# Operations Notes

## Render deployment assumptions

- This app currently assumes a single Render instance for payment and bonus state changes.
- Runtime state under `data/` must be persistent for production operation.
- Do not scale horizontally with multiple app instances while the current file-based storage and lock files are in use.

## Limited prerelease SNS operation

Daily X / Threads posting is handled by `scripts/social/daily-oracle-post.js`.
Due-time execution is handled by `scripts/social/run-scheduled-posts.js`.

X automation should use the official API. Do not use Playwright or other browser automation to script the X website for posting. Before turning on X automation, enable the automated account label and make the account bio clear about who operates it.

### Draft generation

Run without credentials to create or inspect the daily content:

```powershell
npm run social:draft
npm run social:write
```

Generated JSON drafts are written under `data/social-posts/`, which is intentionally gitignored.

### Auto posting

Set these only in the machine or job runner that performs SNS posting:

- `PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com`
- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `THREADS_USER_ID`
- `THREADS_ACCESS_TOKEN`
- `THREADS_PUBLISH_WAIT_MS=30000`
- `SOCIAL_AUTOMATED_POSTING_ENABLED=true`
- `SOCIAL_PLATFORMS=x,threads`
- `SOCIAL_ORACLE_TIME=07:00`
- `SOCIAL_CONCEPT_TIME=20:00`

Recommended schedule:

- `07:00 Asia/Tokyo`: oracle image post
- `20:00 Asia/Tokyo`: concept post

Run a dry check before enabling real posting on any new machine:

```powershell
node scripts/social/run-scheduled-posts.js --dry-run
```

Run due posts once:

```powershell
npm run social:run-due
```

Run as a long-lived local process:

```powershell
npm run social:daemon
```

The scheduler writes `data/social-posts/scheduled-post-state.json` and will not post the same kind twice on the same JST date after a successful post.

## File-backed state

The following production paths are part of the app's state and must persist across deploys/restarts:

- `data/users`
- `data/vault-history`
- `data/purchase-orders`
- `data/paid-reading-tickets`
- `data/rashin-paid-codes`
- `data/rashin-discount-checkout-locks`
- `data/indexes`

## Transaction TODOs

Before horizontal scaling, move these operations to a database with transactions or conditional writes:

- Google user record updates for `rashin_stones` and `last_rashin_bonus_claimed_date`
- Rashin bonus discount checkout lock acquisition
- Purchase order creation and status changes
- Rashin paid code issue and redemption
- Paid reading ticket creation by Rashin code hash
- Vault history reads used for latest free-reading eligibility

## Render paid access runbook

Use this checklist before enabling paid deep-reading sales.

### Required Render environment variables

Set these on the Render service and redeploy before testing:

- `NODE_ENV=production`
- `PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com`
- `ENABLE_DEV_ACCESS=false`
- `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
- `MEMBER_SESSION_SECRET=<strong random secret>`
- `AUTH_SESSION_SECRET=<strong random secret>`
- `RASHIN_FREE_PAID_CODES=<comma-separated 12-character one-time codes>`

Do not publish a payment link until the payment account/provider has approved this business model.

### Manual free Rashin codes

Rashin paid codes are not auto-issued from payment. A code in `RASHIN_FREE_PAID_CODES` unlocks one deep reading once, for the Google account and free reading result used during redemption.

1. Create a 12-character uppercase alphanumeric code.
2. Add it to `RASHIN_FREE_PAID_CODES` and redeploy.
3. Send the code to the intended user by your chosen support channel.
4. Confirm Render logs show:
   - `Runtime: NODE_ENV=production`
   - `devAccess=disabled`
   - `Public origin: configured`

### Purchase scenarios

Use a Google login account dedicated to test payments.

1. Normal 980 yen order:
   - Start from the latest free reading result.
   - Confirm the payment provider creates or confirms a `980 JPY` payment.
   - Confirm a paid reading ticket is created under `data/paid-reading-tickets`.
   - Confirm the paid ticket has `finalAmount: 980` and `discountAmount: 0`.

2. 100 yen OFF order:
   - Prepare the test user with `rashin_stones: 3`.
   - Start a paid purchase from the latest free reading result.
   - Confirm the final amount is `880 JPY`.
   - Confirm `rashin_stones` decreases by 3 only after successful payment confirmation.

3. 200 yen OFF order:
   - Prepare the test user with `rashin_stones: 7`.
   - Start a paid purchase from the latest free reading result.
   - Confirm the final amount is `780 JPY`.
   - Confirm `rashin_stones` decreases by 7 only after successful payment confirmation.

4. Manual free code:
   - Add a test code to `RASHIN_FREE_PAID_CODES`.
   - Redeem the code from a logged-in Google account on the latest free reading result.
   - Confirm a paid ticket is created with `finalAmount: 0`, `discountAmount: 980`, and `paymentProvider: manual_free_code`.
   - Confirm the code hash record under `data/rashin-paid-codes` moves to `status: redeemed`.

5. Duplicate free code redemption:
   - Redeem a code once.
   - Try to redeem the same code again.
   - Confirm the second attempt returns `RASHIN_PAID_CODE_ALREADY_USED`.
   - Confirm no second ticket is created.

6. Unpaid order:
   - Start a paid order and abandon payment.
   - Confirm no paid ticket exists.
   - Confirm `rashin_stones` did not change.

### Render logs to inspect

Expected successful payment path:

- A paid ticket is created once after payment confirmation or free code redemption.
- For discounted purchases, `rashinBonusConsumedAt` is set once after payment confirmation.

Expected manual free code path:

- A code hash record is created only after the first valid redemption.
- The plain Rashin code is not written to data files.
- No paid ticket exists until code redemption succeeds.
- User-facing API response remains generic and does not expose stack traces or internal errors.

Failure logs that require investigation before launch:

- `RASHIN_CODE_ISSUE_FAILED`
- `RASHIN_PAID_CODE_REDEEM_FAILED`
- `PURCHASE_ORDER_SESSION_MISMATCH`
- `PURCHASE_ORDER_SOURCE_MISMATCH`
- Any response body exposing `stack`, raw secrets, full email addresses, plain code history, or server file paths

### Data files to inspect

- User stones: `data/users/<userId>.json`
- Free reading ownership/latest result: `data/vault-history/<hashed-user-key>.json`
- Purchase order: `data/purchase-orders/<purchaseOrderId>.json`
- Paid ticket: `data/paid-reading-tickets/<ticketId>.json`
- Rashin code hash record: `data/rashin-paid-codes/<codeHash>.json`
- Discount checkout lock: `data/rashin-discount-checkout-locks/<hash>.json`

### Go/no-go criteria

Do not enable paid sales unless all are true:

- `980`, `880`, and `780` JPY one-time amounts are confirmed.
- `2,980` JPY monthly plan copy and provider settings are consistent.
- Manual free codes create exactly one free paid ticket.
- Duplicate code redemption does not create another ticket.
- Unpaid orders do not consume stones.
- Render is running as a single instance, or state has been moved to transactional storage.
