# QR self-ordering

Guests scan the QR code on their table, browse the live menu, order with notes,
and follow their order until it's served. QR orders use the same pipeline as
waiter orders: same queue, same order numbers, same printing, same settlement.

## Waiters and tables

Each table can have an assigned waiter (Dashboard › Tables › edit a table ›
"Waiter for this table"). A QR order from that table belongs to that waiter:
their name is on the kitchen/barista tickets, the till and web cashier alerts
and the order; it appears in their own orders; and their waiter app shows
only their tables' QR orders and guest requests (plus tables with no waiter,
so nothing is missed). A table with no waiter shows "No waiter assigned"
everywhere so staff know to pick it up.

## Run it locally

Needs Node 22, Docker, and pnpm 9 (`npx -y pnpm@9.15.9` works without a global install).

```bash
# 1. A throwaway Postgres (never point this at a real database)
docker run --name qr-test-pg -e POSTGRES_PASSWORD=test -p 5433:5432 -d postgres:16
docker exec qr-test-pg psql -U postgres -c "CREATE DATABASE qr_cafe_dev;"

# 2. Backend
cd backend
cp .env.example .env        # then set DATABASE_URL=postgresql://postgres:test@localhost:5433/qr_cafe_dev
                            # and WEB_ORIGIN=http://localhost:3100,http://<your-LAN-IP>:3100
pnpm install
npx drizzle-kit push        # fresh dev DB from the current schema
pnpm init-db                # super admin
pnpm db:seed-qr-demo        # demo café, staff, menu, tables + QR links (printed)
pnpm build && node dist/src/main.js          # http://localhost:5000

# 3. Web (owner dashboard, cashier, waiter, guest app)
cd ../web
pnpm install --config.node-linker=hoisted     # hoisted: avoids Windows path-length errors in OneDrive
pnpm build && pnpm start -p 3100 -H 0.0.0.0   # http://localhost:3100
```

`pnpm db:seed-qr-demo` prints every table's guest link (`/t/<token>`) and the logins:

| Who | Where | Sign in |
| --- | --- | --- |
| Owner | `/login` | `owner` / `owner123` |
| Cashier | `/cashier` | setup code `BUNADEMO2026`, then Selam / `cashier123` |
| Waiter | `/waiter` | setup code `BUNADEMO2026`, then Dawit / PIN `1234` |

To try it on a phone, open `http://<your-LAN-IP>:3100/t/<token>` (the IP must
be in `WEB_ORIGIN`). For printed cards to work on phones, open the dashboard
from that same address (or set `NEXT_PUBLIC_GUEST_BASE_URL` / `GUEST_BASE_URL`).

## Deploying

1. **Run migration 0017 on the real database:** `pnpm db:migrate` in `backend/`.
   The server does **not** migrate on start (the call in `db.module.ts` is
   commented out). Try it on a copy first.
2. Backend env: `WEB_ORIGIN` (the guest app's public origin(s)), `GUEST_BASE_URL`
   (address printed in QR codes), `TRUST_PROXY=1` behind a reverse proxy (the
   rate limiter keys on client IPs). Let the proxy gzip responses.
3. Web env: `NEXT_PUBLIC_API_URL` (browser → API), `INTERNAL_API_URL` (web
   server → API, for the server-rendered welcome screen), and optionally
   `NEXT_PUBLIC_GUEST_BASE_URL`.
4. Turn it on per branch: Dashboard › Settings › QR ordering. It's **off** by default.
5. Rebuild and roll out the desktop POS (printing changes are in the app).

Security change shipped with this (M9): requests without a device token or JWT
are refused, except sign-in, enrollment, health and the guest API.
`LEGACY_UNAUTHENTICATED_TENANT=true` restores the old behaviour in an emergency.

## Tests

```bash
cd backend && pnpm test     # needs the qr-test-pg container; uses its own qr_e2e database
```

## Adding Telebirr, Chapa or CBE Birr later

Everything except the adapter is already wired: the registry, the guest's
"How would you like to pay?" step (shown automatically once a second provider
is on), the webhook route, `payment_intents`, and idempotent settlement through
the cashier's own `PaymentService.create`.

1. Fill in `backend/src/modules/payment/providers/<provider>.provider.ts`. Each
   file's TODO lists the env vars, the flow (redirect or USSD push) and where to
   verify webhook signatures.
2. Set `implemented = true` and make `isEnabled(branchId)` return
   `env present && isMethodActive(branchId, "<id>")`.
3. Add the env vars (listed in `backend/.env.example`).
4. Add an active payment method row named `telebirr` / `chapa` / `cbe_birr` for the branch.
5. Register the webhook URL `https://<api>/api/public/payments/<id>/webhook` with the provider.
6. Test it in the provider's sandbox:
   - a successful payment
   - a replayed webhook (it must not pay twice; see `test/payments.e2e.spec.ts`)
   - a cash payment made first (the intent is marked `needs_refund`)
   - a failed or expired payment
7. Make the provider switchable in Settings › QR ordering (it shows "Coming soon" today).

## Hands-on checklist: real printers and POS

Automated tests cover the server and the print-job logic, but not physical
printers. Run this once in the café before going live.

**Setup**
1. Install the new POS build on the till and sign in as the cashier.
2. In the POS, go to Printer settings: barista section → barista printer, kitchen section → kitchen printer.
   Leave one section (e.g. Juice) with no printer.
3. In the web dashboard, open Settings › QR ordering:
   - Turn on "Let guests order from their table".
   - Check that the Juice section shows the "no printer, so its orders will print on the main printer" warning.
4. Press "Print a test QR ticket" for each section. Check that each test page
   comes out of the right printer, and that Juice prints on the main printer.

**Normal order**

5. Print one table card (Tables › QR code › Print table card). Scan it with a phone on the café Wi-Fi.
6. Order one coffee with the note "No sugar" and one food item with "Extra spicy". Add your name.
7. Check each ticket:
   - The coffee prints **only** on the barista printer and the food **only** on the kitchen printer, each **once**.
   - Each ticket's header shows "QR ORDER · Table N", your name and the order number.
   - The notes print in bold.
8. On the phone, the tracker moves to "In the kitchen" within a few seconds.
9. On the web cashier, the order shows "QR · Table N" and your name. The "Not printed yet" badge disappears.

**Adding items**

10. On the phone, press "Add more items" and add one coffee with "Extra hot". Only that item prints, as an "ITEMS ADDED" ticket on the barista printer.

**Guest requests**

11. Press "Call waiter", then "Ask for the bill". Both alerts appear with a chime on the POS, the web cashier and the waiter app.
12. Press "On it" on one screen. The alert clears on the others.

**Payment**

13. Take payment at the till. On the phone, the tracker shows "Served · Paid".

**Printer failure**

14. Unplug the kitchen printer (or take the paper out) and place another drink + food order.
15. The barista ticket prints. The POS shows the print-failure banner for the order. The phone stays on "Order sent".
16. Plug the printer back in. Within a few seconds **only the kitchen ticket** prints. The barista ticket is **not** printed again.

**Offline POS**

17. Turn the POS off and place a QR order. The web cashier shows it with "Not printed yet".
18. Turn the POS on. The order prints once.

**Amharic**

19. Switch the guest app to አማርኛ, place an order with an Amharic note (e.g. ያለ ስኳር), and check that the note prints legibly.

**Cashier accept**

20. Turn on "A cashier accepts each order first". Place an order:
    - It does **not** print.
    - On the phone it shows "A member of staff will confirm…".
    - Press Accept on the web cashier. It prints.
