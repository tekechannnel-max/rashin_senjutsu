# Operations Notes

## Render deployment assumptions

- This app currently assumes a single Render instance for payment and bonus state changes.
- Runtime state under `data/` must be persistent for production operation.
- Do not scale horizontally with multiple app instances while the current file-based storage and lock files are in use.

## File-backed state

The following production paths are part of the app's state and must persist across deploys/restarts:

- `data/users`
- `data/vault-history`
- `data/purchase-orders`
- `data/paid-reading-tickets`
- `data/stripe-events`
- `data/stripe-checkout-completions`
- `data/rashin-discount-checkout-locks`
- `data/indexes`

## Transaction TODOs

Before horizontal scaling, move these operations to a database with transactions or conditional writes:

- Google user record updates for `rashin_stones` and `last_rashin_bonus_claimed_date`
- Rashin bonus discount checkout lock acquisition
- Purchase order creation and status changes
- Paid reading ticket creation by Stripe Checkout Session ID
- Stripe webhook idempotency records
- Vault history reads used for latest free-reading eligibility

## Render Stripe test-mode checkout runbook

Use this checklist before switching Stripe keys from test mode to live mode.

### Required Render environment variables

Set these on the Render service and redeploy before testing:

- `NODE_ENV=production`
- `PUBLIC_ORIGIN=https://rashin-senjutsu.onrender.com`
- `ENABLE_DEV_ACCESS=false`
- `STRIPE_SECRET_KEY=sk_test_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_PRICE_ID_DEEP_READING_580=price_...`
- `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`
- `MEMBER_SESSION_SECRET=<strong random secret>`
- `AUTH_SESSION_SECRET=<strong random secret>`

Do not put live keys in Render until all test-mode checks below pass.

### Stripe webhook setup

In Stripe Dashboard test mode:

1. Create or verify the webhook endpoint:
   - URL: `https://rashin-senjutsu.onrender.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`
2. Copy the endpoint signing secret into Render as `STRIPE_WEBHOOK_SECRET`.
3. Redeploy the Render service.
4. Confirm Render logs show:
   - `Runtime: NODE_ENV=production`
   - `devAccess=disabled`
   - `Public origin: configured`
   - `Stripe checkout: configured`
   - `Stripe webhook: configured`

### Checkout scenarios

Use a Google login account dedicated to test payments. Run these with Stripe test cards only.

1. Normal 580 yen Checkout:
   - Start from the latest free reading result.
   - Confirm the app opens Stripe Checkout for `580 JPY`.
   - Complete payment with a Stripe test card.
   - Confirm a paid reading ticket is created under `data/paid-reading-tickets`.
   - Confirm the purchase order under `data/purchase-orders` has `finalAmount: 580`, `discountAmount: 0`, and `paidAt`.

2. 100 yen OFF Checkout:
   - Prepare the test user with `rashin_stones: 3`.
   - Start Checkout from the latest free reading result.
   - Confirm Stripe Checkout shows `480 JPY`.
   - Complete payment.
   - Confirm `rashin_stones` decreases by 3 only after payment success.
   - Confirm the purchase order has `discountAmount: 100`, `finalAmount: 480`, `discountStonesUsed: 3`, and `rashinBonusConsumedAt`.

3. 200 yen OFF Checkout:
   - Prepare the test user with `rashin_stones: 7`.
   - Start Checkout from the latest free reading result.
   - Confirm Stripe Checkout shows `380 JPY`.
   - Complete payment.
   - Confirm `rashin_stones` decreases by 7 only after payment success.
   - Confirm the purchase order has `discountAmount: 200`, `finalAmount: 380`, `discountStonesUsed: 7`, and `rashinBonusConsumedAt`.

4. Cancel flow:
   - Start a discounted Checkout.
   - Cancel from Stripe Checkout.
   - Confirm the user returns to the app without a paid ticket.
   - Confirm `rashin_stones` did not change.

5. Duplicate webhook / return URL idempotency:
   - In Stripe Dashboard test mode, resend the same `checkout.session.completed` event.
   - Confirm only one ticket exists for the same `stripeCheckoutSessionId`.
   - Confirm `rashin_stones` is not consumed a second time.
   - Confirm duplicate webhook logs return successfully without a second ticket.

6. Multiple discounted Checkout attempts:
   - With `rashin_stones: 3` or `7`, start a discounted Checkout.
   - Before completing it, try to start another discounted Checkout for the same user.
   - Confirm the second attempt is rejected with `RASHIN_DISCOUNT_CHECKOUT_ALREADY_OPEN`.
   - Confirm no extra purchase order becomes payable with a discount.

7. Stones shortage after paid event:
   - Simulate or manually prepare two discounted paid sessions for the same user.
   - Complete/process the first session.
   - Process the second session after stones are no longer sufficient.
   - Confirm the second order becomes `requires_manual_review`.
   - Confirm no ticket is issued for the second session.
   - Confirm stones do not go negative.

### Render logs to inspect

Expected successful payment path:

- No `STRIPE_SIGNATURE_INVALID`.
- No `STRIPE_SESSION_AMOUNT_MISMATCH`.
- Purchase order status moves to `paid`.
- A paid ticket is created once for the Stripe Checkout Session.
- For discounted purchases, `rashinBonusConsumedAt` is set once.

Expected manual-review path:

- Log contains `Rashin bonus payment requires manual review`.
- Purchase order status is `requires_manual_review`.
- No paid ticket exists for that Checkout Session.
- User-facing API response remains generic and does not expose stack traces or internal errors.

Failure logs that require investigation before launch:

- `STRIPE_SIGNATURE_INVALID`
- `STRIPE_SESSION_AMOUNT_MISMATCH`
- `PURCHASE_ORDER_SESSION_MISMATCH`
- `PURCHASE_ORDER_SOURCE_MISMATCH`
- Repeated `STRIPE_WEBHOOK_PROCESS_FAILED`
- Any response body exposing `stack`, raw Stripe secret values, or server file paths

### Data files to inspect

- User stones: `data/users/<userId>.json`
- Free reading ownership/latest result: `data/vault-history/<hashed-user-key>.json`
- Purchase order: `data/purchase-orders/<purchaseOrderId>.json`
- Paid ticket: `data/paid-reading-tickets/<ticketId>.json`
- Webhook idempotency: `data/stripe-events/<eventId>.json`
- Discount checkout lock: `data/rashin-discount-checkout-locks/<hash>.json`

### Go/no-go criteria

Do not switch to live keys unless all are true:

- `580`, `480`, and `380` JPY Checkout amounts are confirmed in Stripe test mode.
- Tickets are issued only after successful payment.
- Canceled Checkout does not consume stones.
- Duplicate webhook resend does not create another ticket.
- Duplicate webhook resend does not consume stones again.
- Discounted multiple Checkout attempts are blocked while one discounted Checkout is open.
- Stones shortage at payment success leads to `requires_manual_review` and no ticket.
- Render is running as a single instance, or state has been moved to transactional storage.
