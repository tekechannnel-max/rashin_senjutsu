# Operations Notes

## Render deployment assumptions

- This app currently assumes a single Render instance for payment and bonus state changes.
- Runtime state under `data/` must be persistent for production operation.
- Do not scale horizontally with multiple app instances while the current file-based storage and lock files are in use.

## Limited prerelease SNS operation

SNS operation is documented in `docs/sns-runbook.md`.

Current summary:

- Threads scheduled posting runs on Render Cron Job `rashin-threads-scheduler`.
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
- `data/rashin-discount-checkout-locks`
- `data/indexes`

## Transaction TODOs

Before horizontal scaling, move these operations to a database with transactions or conditional writes:

- Google user record updates for `rashin_stones` (displayed as 鄒・・縺ｮ縺九￠繧・ and `last_rashin_bonus_claimed_date`
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
- `BOOTH_DEEP_READING_URL=<your BOOTH product URL>`
- `BOOTH_PAYMENT_LABEL=鄒・・蜊陦・BOOTH`
- `BOOTH_PAYMENT_NOTE=BOOTH縺ｧ雉ｼ蜈･蠕後∵ｳｨ譁・分蜿ｷ繧貞・蜉帙＠縺ｦ縺上□縺輔＞縲Ａ
- `BOOTH_GMAIL_VERIFICATION_REQUIRED=true`
- `BOOTH_GMAIL_IMAP_USER=<Gmail address that receives BOOTH order mail>`
- `BOOTH_GMAIL_IMAP_APP_PASSWORD=<Gmail app password>`
- `BOOTH_GMAIL_IMAP_MAILBOX=INBOX`
- `BOOTH_GMAIL_SEARCH_FROM=booth.pm`
- `BOOTH_GMAIL_SEARCH_DAYS=90`
- `BOOTH_GMAIL_MATCH_BUYER_EMAIL=false`
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
5. The server searches the configured Gmail inbox for a BOOTH purchase email containing that order number.
6. If the Gmail match exists, the server creates and immediately redeems an internal Rashin paid code, creates one paid-reading ticket, and the app continues automatically.
7. The same BOOTH order number cannot be used again.

Security boundary: Gmail verification confirms that a BOOTH purchase email containing the submitted order number exists in the configured mailbox. It is not an official BOOTH webhook. Keep the Gmail account private, use an app password, and keep duplicate-order blocking enabled.

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
- Monthly plan copy is not visible while BOOTH order-number purchase is active.
- For release pricing, set `DEEP_READING_ONCE_AMOUNT=1000` and update visible price copy from prerelease to normal price.
- Manual free codes create exactly one free paid ticket.
- Duplicate code redemption does not create another ticket.
- Unpaid orders do not consume stones.
- Render is running as a single instance, or state has been moved to transactional storage.
