# Operations Notes

## Render deployment assumptions

- This app currently assumes a single Render instance for payment and bonus state changes.
- Runtime state under `data/` must be persistent for production operation.
- Do not scale horizontally with multiple app instances while the current file-based storage and lock files are in use.
- Treat single-instance operation and persistent `data/` storage as release gates, not performance preferences. If either is not verified, keep paid access in test-only mode even when local syntax checks pass.

## Limited prerelease SNS operation

SNS operation is documented in `docs/sns-runbook.md`.

Current summary:

- Threads / Bluesky / Instagram scheduled posting runs on Render Cron Job `rashin-threads-scheduler`.
- X is draft-only until official X API posting is explicitly enabled.
- Local Windows Task Scheduler, visible PowerShell launches, and local daemon processes are not allowed for SNS operation.
- Posting scripts live under `scripts/social/`.

## File-backed state

The following production paths are part of the app's state and must persist across deploys/restarts:

- `data/users`
- `data/vault-history`
- `data/purchase-orders`
- `data/paid-reading-tickets`
- `data/rashin-paid-codes`
- `data/rashin-discount-checkout-locks` (legacy; not used while fragment discounts are disabled)
- `data/indexes`

## Transaction TODOs

Before horizontal scaling, move these operations to a database with transactions or conditional writes:

- Google user record updates for `rashin_stones` (displayed as 羅針のかけら) and `last_rashin_bonus_claimed_date`
- Rashin fragment paid-ticket exchange
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
- `RASHIN_FREE_PAID_CODE_HASH_FILE=config/rashin-free-paid-code-hashes.json`
- `DEEP_READING_ONCE_AMOUNT=780`
- `DEEP_READING_PRERELEASE_AMOUNT=780`
- `DEEP_READING_RELEASE_AMOUNT=1000`
- `BOOTH_DEEP_READING_URL=<your BOOTH product URL>`
- `BOOTH_PAYMENT_LABEL=羅針占術 BOOTH`
- `BOOTH_PAYMENT_NOTE=BOOTH内のどのグッズを購入しても、購入後のBOOTH注文番号で深掘り羅針鑑定を利用できます。`
- `BOOTH_GMAIL_VERIFICATION_REQUIRED=true`
- `BOOTH_GMAIL_IMAP_USER=<Gmail address that receives BOOTH order mail>`
- `BOOTH_GMAIL_IMAP_APP_PASSWORD=<Gmail app password>`
- `BOOTH_GMAIL_IMAP_MAILBOX=INBOX`
- `BOOTH_GMAIL_SEARCH_FROM=booth.pm`
- `BOOTH_GMAIL_SEARCH_DAYS=90`
- `BOOTH_GMAIL_MATCH_BUYER_EMAIL=false`
- `BOOTH_ORDER_REFERENCE_HASH_FILE=config/booth-order-reference-hashes.json`
- `BOOTH_ORDER_REFERENCE_HASHES=` as an emergency allowlist for already confirmed BOOTH order numbers. Store only `sha256("booth_order_reference:" + normalized_lowercase_order_reference)`.
- `OPENAI_PAID_AB_MODEL=gpt-5.5`
- `PAID_MODEL_AB_TEST_ENABLED=false` for quality-first production. Set `true` only when intentionally testing GPT-5.5 against Sonnet 4.6.
- `PAID_MODEL_AB_TEST_OPENAI_WEIGHT=50` for a 50/50 split

Do not publish the paid purchase CTA until the BOOTH product page is ready and the item description tells buyers to enter the BOOTH order number in the app.

### Paid model A/B test

Quality-first production should keep `PAID_MODEL_AB_TEST_ENABLED=false`, which means paid reading generation uses `ANTHROPIC_PAID_MODEL` only. When `PAID_MODEL_AB_TEST_ENABLED=true`, paid reading generation is assigned per reading to either `ANTHROPIC_PAID_MODEL` or `OPENAI_PAID_AB_MODEL`.
The default prerelease comparison is Sonnet 4.6 versus GPT-5.5 at `PAID_MODEL_AB_TEST_OPENAI_WEIGHT=50`.
AI logs include the A/B test name, variant, provider, model, and bucket so quality, errors, latency, and token usage can be compared after real paid readings.

### BOOTH order-number unlock

This prerelease path removes manual Rashin-code handoff while still keeping paid access behind Google login and a purchase order.

1. User starts paid deep reading.
2. Server creates a `booth` purchase order.
3. User buys the deep reading ticket or eligible goods on BOOTH.
4. User enters the BOOTH order number in the app.
5. The server verifies the order number by either searching the configured Gmail inbox for a BOOTH purchase email containing that order number, or by checking the BOOTH order-number hash allowlist for already confirmed orders.
6. If verification succeeds, the server creates and immediately redeems an internal Rashin paid code, creates one paid-reading ticket, and the app continues automatically.
7. The same BOOTH order number cannot be used again.

Security boundary: Gmail verification confirms that a BOOTH purchase email containing the submitted order number exists in the configured mailbox. The hash allowlist is only for order numbers the operator has already confirmed outside the app. This is not an official BOOTH webhook. Keep the Gmail account private, use an app password, do not store raw order numbers in the repo, and keep duplicate-order blocking enabled.

Hash a confirmed BOOTH order number for the emergency allowlist:

```powershell
npm run booth:hash-order -- <booth-order-number>
```

Admin Gmail test:

```powershell
$body = @{
  boothOrderNumber = "replace-with-booth-order-number"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://rashin-senjutsu.onrender.com/api/rashin-paid-code/booth/gmail-test" `
  -Method Post `
  -Headers @{"x-rashin-admin-secret"=$env:RASHIN_CODE_ADMIN_SECRET} `
  -ContentType "application/json" `
  -Body $body
```

### Manual free Rashin codes

Manual free Rashin codes remain available as a fallback. The normal manual-code pool is the prepared 100+ code hash list at `config/rashin-free-paid-code-hashes.json`; `RASHIN_FREE_PAID_CODES` is only an emergency override for extra one-off codes.

1. Pick an unused 12-character code from the private ledger `data/rashin-free-paid-codes-2026-04-30.csv`.
2. Send the code to the intended user by your chosen support channel.
3. Do not edit Render environment variables for codes already covered by the hash pool.
4. When the private ledger changes, run `npm run rashin:build-code-pool` and deploy the updated hash pool. The command fails if fewer than 100 active codes are available.
5. Confirm Render logs show:
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

2. 30-fragment free paid reading:
   - Prepare the test user with `rashin_stones: 30`.
   - Start a paid reading from the latest free reading result, or start paid reading directly while signed in.
   - Confirm a paid reading ticket is created under `data/paid-reading-tickets`.
   - Confirm the paid ticket has `finalAmount: 0`, `discountAmount: 780`, `discountStonesUsed: 30`, and `paymentProvider: rashin_fragments`.
   - Confirm `rashin_stones` decreases by 30 when the fragment ticket is created.

3. Manual free code:
   - Use a code from the prepared hash pool or add a temporary override to `RASHIN_FREE_PAID_CODES`.
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
- For 30-fragment exchanges, a paid ticket is created immediately and no external payment is opened.

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
- Legacy discount checkout lock: `data/rashin-discount-checkout-locks/<hash>.json`

### Go/no-go criteria

Do not enable paid sales unless all are true:

- `780` JPY prerelease one-time amount is confirmed.
- Monthly plan copy is not visible while BOOTH order-number purchase is active.
- For release pricing, set `DEEP_READING_ONCE_AMOUNT=1000` and update visible price copy from prerelease to normal price.
- Manual free codes create exactly one free paid ticket.
- Duplicate code redemption does not create another ticket.
- Unpaid orders do not consume stones.
- 30-fragment exchanges consume exactly 30 stones and create exactly one free paid ticket.
- Render `data/` paths are backed by persistent storage and survive redeploys/restarts.
- Render is running as a single app instance, or state has been moved to transactional storage.
