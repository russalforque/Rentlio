# Landlord workspace redesign

Implemented in the existing React / TypeScript / Tailwind application. No schema migrations, production records, authentication rules, tenant routes, or tenant bottom-navigation definitions were changed.

## Audit and design decisions

The app already had server-authoritative financial operations, idempotent payment requests, responsive dialogs, mobile record lists, and reusable panels. These were retained. The audit identified four recurring usability problems:

- Recording money received required finding and opening a bill first.
- Current physical cash was buried in the daily-report dialog.
- Important figures could truncate inside narrow KPI and collection cells; transaction actions crowded phone rows.
- Dialog dismissal and background meter-sheet refetches could lose work. Supporting pages and portal-mounted controls needed the same landlord visual treatment.

The design uses a white sidebar, gray workspace, dark primary actions, restrained green/amber/red status colors, flat bordered surfaces, compact typography, and consistent 44px touch controls. Landlord theme tokens live in `src/layouts/landlord.css`. The `LandlordWorkspace` React context carries the theme through dialog, dropdown, select, popover, and sheet portals. Tenant surfaces retain their existing styles.

## Route and workflow coverage

| Screen | Result |
| --- | --- |
| `/dashboard` | Direct payment entry, current daily cash, collections, outstanding balances, operational action center, transaction activity, occupancy, and due dates. Operational content precedes historical charts on phones. |
| `/rooms` | Responsive room rows/cards, occupancy/rent/balance visibility, and direct tenant/billing links alongside existing room, bed, meter, and bulk-rent management. |
| `/tenants` | Search and account filters plus a balance-due view and direct payment entry. |
| `/tenants/:id` | Consistent detail header and tenant-specific unpaid-bill picker; protected assignment, move, tenancy, rent, occupant, deposit, and contact forms. |
| `/registrations` | Shared visual system, readable narrow-screen figures, existing identity-verification and access controls retained. |
| `/billing` | Read/review/send workflow navigation, bill search, status filters, consolidated totals, and existing bulk generation/finalization safeguards. |
| `/billing/readings` | Room/tenant search, incomplete and unsaved filters, accessible per-meter calculation feedback, wider-screen meter columns, save dock, and navigation/refresh protection. Focus/reconnect refetches are disabled while editing. |
| `/billing/bills/:id` | Consistent detail treatment, payment summary, and protected charge, due-date, and void forms. Existing invoice locks and payment verification remain intact. |
| `/payments` | Unpaid-bill picker, full/partial payment preview, transfer review queue, history, and mobile receipt access. Optional recording fields collapse to keep the core form compact. |
| `/finances` | Expense entry in the header, physical cash panel, accessible exports, mobile transaction actions, explicit deletion dialog, and inline form validation. Manual income remains distinct from verified bill collections. |
| `/reports` | Existing collection/arrears/occupancy reporting plus daily cash report access. |
| `/settings` | Shared section layout and themed controls, compact section navigation, and unsaved-settings navigation protection. Existing payment accounts, rates, reminders, and private demo tools remain available. |
| `/account`, `/notifications` | Shared landlord headers, section surfaces, themed overlays, and accessible controls. Tenant variants retain their own headers and styles. |
| `/receipts/:id` | Landlord-scoped surface styling with the existing receipt allocations and print/PDF behavior. |

## Reusable changes

- `PageHeader`: consistent heading, description, actions, divider, and responsive wrapping.
- `Panel` / `StatTile` / `FilterChips` / `SearchField`: consistent figures and filters, wrapping landlord amounts, and arrow-key radio navigation.
- `FormField`: errors and helper text linked to their controls with accessible descriptions.
- `ResponsiveSheet`: mobile bottom sheet / desktop dialog using existing Radix behavior, unsaved-change protection, and pending-operation dismissal protection.
- `RecordPaymentButton`: shared unpaid-bill search and existing payment form, reused across operational screens.
- `CashOverview`: existing daily cash calculation reused on dashboard and finances.
- `cash-report-image.ts`: separated image renderer, readable 480px logical-width export at 3× resolution, wrapped labels, and all required cash totals.

## Financial and security preservation

The redesign continues using existing Supabase queries and RPCs. Meter reset/replacement/rollover and review behavior, utility rates and rounding, finalized-bill locks, payment allocation order, request IDs, proof validation, receipts, deposits, RLS, and tenant isolation remain server-authoritative. The unpaid-bill query also returns the existing pending amount so the payment form can flag a proof awaiting verification.

Daily cash uses the existing integer-cent calculation and payment-ID grouping. One payment covering rent, electricity, and water stays one collection entry. Non-cash payments and deposits remain excluded. The on-screen ending-cash preview now uses the same rounded result as the downloaded report.

## Validation

- `npm.cmd run test:unit`: 39 tests passed, including report-image bounds for 28 collections and a long unbroken expense description.
- `npm.cmd run test:db`: 178 tests passed against the existing isolated PGlite database suite; no deployed database was used.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed during implementation; rerun after final changes.
- `npm.cmd run build`: passed during implementation; rerun after final changes.
- Browser QA uses synthetic records, a synthetic auth session, and a localhost-only Supabase endpoint. All external HTTP and websocket connections are intercepted. It checks every landlord route at 320, 375, 430, 768, 1024, 1440, and 1920px, plus error/empty states, key forms, navigation protection, dark mode, report download, and tenant navigation preservation.

Generated screenshots and machine-readable results are written to the ignored `artifacts/landlord-qa/` directory. The browser suite is `tests/ui/landlord-smoke.mjs`.

### Reproduce browser QA

Start Vite with synthetic configuration in a separate terminal:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic_ui_qa'
npm.cmd run dev -- --host 127.0.0.1 --port 5186 --strictPort
```

Run the suite using an available Playwright installation and browser:

```powershell
$env:PLAYWRIGHT_MODULE='C:\path\to\playwright\index.mjs'
$env:QA_BROWSER_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node tests/ui/landlord-smoke.mjs
```

If Playwright is installed in the project and its matching browser is available, omit both environment variables. `QA_BASE_URL` selects another local server; `QA_WIDTHS` optionally selects a comma-separated subset of widths.

## Verification limits

Browser checks use Chromium, synthetic responses, and simulated viewport sizes. Live payment-provider checkout, email delivery, real physical-device keyboards/safe areas, and Safari/Firefox were not exercised. Existing database integration tests cover the backend financial/security behavior. No deployment was performed. The production build may retain Vite's large-chunk advisory for the application bundle.
