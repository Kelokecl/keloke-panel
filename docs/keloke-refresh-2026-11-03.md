# Keloke workspace refresh — 3 November 2026

## Shipped scope
- Responsive workspace shell, grouped navigation, new sign-in experience and marketing/sales overview.
- Instagram mobile list/chat switching at 390px; back navigation and message deduplication.
- Lazy-loaded marketing modules and shared Supabase auth client. Removed storage provisioning on every page load; existing WhatsApp storage remains in place.
- Weekly products: bounded Mercado Libre collection, latest OAuth token store, at most five unique products with positive observed sales and CLP prices, no historical data presented as current, no paid scraping. Sales quantities are cumulative source values, not weekly sales or guaranteed demand.
- Weekly snapshots, status and notices use RLS; admin read only. Scheduler credential stays in Vault; anonymous calls cannot claim a scan. One attempt per week, with one bounded retry on failure.
- Six obsolete product collection schedules paused, definitions/history retained. WhatsApp and content publishing schedules preserved.
- Browser OAuth connection flow uses public-config RPC. Raw OAuth credentials and secret lookup RPCs are no longer available to browser roles; service-role access retained.

## Verification
- Production build completed; six Node tests passed.
- Isolated browser preview (fake data only): desktop overview, 390px Instagram list/chat/back; no horizontal overflow in either mobile pane.
- Database verification: weekly schedule active, obsolete collection jobs inactive, RLS enabled, anonymous claim access denied, raw OAuth credentials inaccessible to anonymous/authenticated browser roles.
- Runtime product collection was invoked through the private scheduler and records provider failures instead of falling back to stale April records.

## Remaining external dependencies
- Mercado Libre authorization is old and may require the account owner to reconnect; do not claim five products are available until the weekly snapshot contains them.
- Meta app renewals remain drafts pending valid reviewer access, actual platform permissions and data-handling confirmations.
- Instagram real inbound/outbound delivery still requires a signed end-to-end provider test; the mobile fixture is not proof of production delivery.
- Gmail inbox and closed-panel push notifications are not implemented. Existing notices operate while the panel is open.
- Existing public-table security advisories outside the OAuth credential repair remain; this change is not a full security audit.
