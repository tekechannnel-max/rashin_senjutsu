# Operations Notes

## Render deployment assumptions

- This app currently assumes a single Render instance for payment and bonus state changes.
- Runtime state under `data/` must be persistent for production operation.
- Do not scale horizontally with multiple app instances while the current file-based storage and lock files are in use.

## Limited prerelease SNS operation

Daily Threads posting is handled by `scripts/social/daily-oracle-post.js`.
Due-time execution is handled by `scripts/social/run-scheduled-posts.js`.

Target Threads account: `https://www.threads.com/@sensai_teke`.

Threads automation should use the official Threads API. Do not use Playwright or other browser automation to script the Threads website for posting.

X automation should use the official API. Do not use Playwright or other browser automation to script the X website for posting. Before turning on X automation, enable the automated account label and make the account bio clear about who operates it.

### Draft generation

Run without credentials to create or inspect the daily content:

```powershell
npm run social:draft
npm run social:threads:draft
npm run social:write
```

Generated JSON drafts are written under `data/social-posts/`, which is intentionally gitignored.

### Auto posting

Set these only in the machine or job runner that performs SNS posting:

- `PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com`
- `THREADS_EXPECTED_USERNAME=sensai_teke`
- `THREADS_APP_ID`
- `THREADS_APP_SECRET`
- `THREADS_REDIRECT_URI=https://rashin-senjutsu.onrender.com/auth/threads/callback`
- `THREADS_SCOPES=threads_basic,threads_content_publish`
- `THREADS_USER_ID`
- `THREADS_ACCESS_TOKEN`
- `THREADS_PUBLISH_WAIT_MS=30000`
- `SOCIAL_AUTOMATED_POSTING_ENABLED=true`
- `SOCIAL_PLATFORMS=threads`
- `SOCIAL_ORACLE_TIME=07:00`
- `SOCIAL_CONCEPT_TIME=20:00`

For initial Threads token setup:

```powershell
npm run threads:connect
npm run threads:doctor
```

`threads:connect` prints the OAuth URL. With the HTTPS redirect URI, the callback page prints the exact exchange command. The exchange command writes `data/social-posts/threads-token.json`; that token file is intentionally gitignored.

If Meta blocks the OAuth redirect, use the Threads settings page's User Token Generator, then run:

```powershell
node scripts/social/threads-tool.js save-token --token="<token-from-user-token-generator>"
npm run threads:doctor
```

Optional X posting uses these only if X automation is explicitly enabled:

- `X_API_KEY`
- `X_API_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`

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

- Google user record updates for `rashin_stones` (displayed as 羅針のかけら) and `last_rashin_bonus_claimed_date`
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
- `DEEP_READING_ONCE_AMOUNT=780`
- `DEEP_READING_PRERELEASE_AMOUNT=780`
- `DEEP_READING_RELEASE_AMOUNT=1000`
- `PAYPAY_MANUAL_PAYMENT_URL=<your PayPay QR/payment URL>`
- `PAYPAY_MANUAL_PAYMENT_LABEL=Rashin Senjutsu PayPay`
- `PAYPAY_MANUAL_PAYMENT_NOTE=<short user-facing PayPay instruction>`
- `PAYPAY_MANUAL_AUTO_ISSUE_ENABLED=true` for prerelease auto-unlock after the user enters a PayPay transaction reference
- `OPENAI_PAID_AB_MODEL=gpt-5.5`
- `PAID_MODEL_AB_TEST_ENABLED=false` for quality-first production. Set `true` only when intentionally testing GPT-5.5 against Sonnet 4.6.
- `PAID_MODEL_AB_TEST_OPENAI_WEIGHT=50` for a 50/50 split

Do not publish a payment link until the payment account/provider has approved this business model.

### Paid model A/B test

Quality-first production should keep `PAID_MODEL_AB_TEST_ENABLED=false`, which means paid reading generation uses `ANTHROPIC_PAID_MODEL` only. When `PAID_MODEL_AB_TEST_ENABLED=true`, paid reading generation is assigned per reading to either `ANTHROPIC_PAID_MODEL` or `OPENAI_PAID_AB_MODEL`.
The default prerelease comparison is Sonnet 4.6 versus GPT-5.5 at `PAID_MODEL_AB_TEST_OPENAI_WEIGHT=50`.
AI logs include the A/B test name, variant, provider, model, and bucket so quality, errors, latency, and token usage can be compared after real paid readings.

### PayPay manual auto-unlock

This prerelease path removes manual Rashin-code handoff while still keeping paid access behind Google login and a purchase order.

1. User starts paid deep reading.
2. Server creates a `paypay_manual` purchase order.
3. User pays through `PAYPAY_MANUAL_PAYMENT_URL`.
4. User enters the PayPay transaction/reference number in the app.
5. If `PAYPAY_MANUAL_AUTO_ISSUE_ENABLED=true`, the server creates and redeems an internal Rashin paid code, creates one paid-reading ticket, and the app continues automatically.
6. If `PAYPAY_MANUAL_AUTO_ISSUE_ENABLED=false`, the payment claim is saved as `payment_requires_review` and no paid ticket is created.

Security boundary: static PayPay QR payments are not automatically verified by PayPay. Auto-issue mode trusts the user's entered PayPay reference, so use it only for limited prerelease volume. For strict automated verification, replace this with PayPay's official online payment API/webhook flow.

### Updating the PayPay URL without redeploy

The PayPay payment URL in Render env is only the fallback/default. If the personal PayPay URL expires, update the active URL through the admin API. This writes `data/paypay-manual-config.json`, so the Render disk must persist `data/`.

```powershell
$env:RASHIN_CODE_ADMIN_SECRET="your-admin-secret"
$body = @{
  url = "https://qr.paypay.ne.jp/new-url"
  label = "羅針占術 PayPay"
  note = "支払い後、PayPayの取引番号を入力してください。"
  expiresAt = "2026-05-25T23:59:59+09:00"
} | ConvertTo-Json
Invoke-RestMethod -Uri "https://rashin-senjutsu.onrender.com/api/rashin-paid-code/paypay/config" -Method Post -Headers @{"x-rashin-admin-secret"=$env:RASHIN_CODE_ADMIN_SECRET} -ContentType "application/json" -Body $body
```

Check the current active URL:

```powershell
Invoke-RestMethod -Uri "https://rashin-senjutsu.onrender.com/api/rashin-paid-code/paypay/config" -Method Get -Headers @{"x-rashin-admin-secret"=$env:RASHIN_CODE_ADMIN_SECRET}
```

### Manual free Rashin codes

Manual free Rashin codes remain available as a fallback. A code in `RASHIN_FREE_PAID_CODES` unlocks one deep reading once, for the Google account and free reading result used during redemption.

1. Create a 12-character uppercase alphanumeric code.
2. Add it to `RASHIN_FREE_PAID_CODES` and redeploy.
3. Send the code to the intended user by your chosen support channel.
4. Confirm Render logs show:
   - `Runtime: NODE_ENV=production`
   - `devAccess=disabled`
   - `Public origin: configured`

### Purchase scenarios

Use a Google login account dedicated to test payments.

1. Normal prerelease 780 yen order:
   - Start from the latest free reading result.
   - Confirm the payment provider creates or confirms a `780 JPY` payment.
   - Confirm a paid reading ticket is created under `data/paid-reading-tickets`.
   - Confirm the paid ticket has `finalAmount: 780` and `discountAmount: 0`.

2. 200 yen OFF fragment order:
   - Prepare the test user with `rashin_stones: 10`.
   - Start a paid purchase from the latest free reading result.
   - Confirm the final amount is `580 JPY`.
   - Confirm `rashin_stones` decreases by 10 only after successful payment confirmation.

3. Manual free code:
   - Add a test code to `RASHIN_FREE_PAID_CODES`.
   - Redeem the code from a logged-in Google account on the latest free reading result.
   - Confirm a paid ticket is created with `finalAmount: 0`, `discountAmount: 780`, and `paymentProvider: manual_free_code`.
   - Confirm the code hash record under `data/rashin-paid-codes` moves to `status: redeemed`.

4. Duplicate free code redemption:
   - Redeem a code once.
   - Try to redeem the same code again.
   - Confirm the second attempt returns `RASHIN_PAID_CODE_ALREADY_USED`.
   - Confirm no second ticket is created.

5. Unpaid order:
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

- `780` JPY prerelease one-time amount is confirmed.
- Monthly plan copy is not visible while PayPay manual payment is active.
- For release pricing, set `DEEP_READING_ONCE_AMOUNT=1000` and update visible price copy from prerelease to normal price.
- Manual free codes create exactly one free paid ticket.
- Duplicate code redemption does not create another ticket.
- Unpaid orders do not consume stones.
- Render is running as a single instance, or state has been moved to transactional storage.
