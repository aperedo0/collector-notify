# Notify V1 Product & UX Specification

## 1. Purpose and authority

This document is the product/UX specification for Notify V1. It describes what customers see, what each screen owns, the canonical interaction flows, exact behavior, and customer-facing scope.

`PLAN.md` is the highest implementation authority and overrides this document wherever it explicitly differs. This file is the "original product spec" referenced by `PLAN.md`.

`docs/UI_HANDOFF.md` controls visual styling only. Screenshots never override behavior.

The complete repository authority order is defined in `PLAN.md` Section 0.1:
`PLAN.md`, `PRODUCT_SPEC.md`, `docs/UI_HANDOFF.md`, tests, `AGENTS.md`, then
implementation. `docs/COMPETITOR_RESEARCH.md` is background only.

## 2. Product definition

Notify is a Target-focused Pokémon product monitoring and alert service.

Customers choose products and set a maximum price threshold. Notify's internal monitoring service observes canonical products centrally. When a qualifying online Target offer is detected at or below a customer's threshold, Notify records a Recent event and delivers the appropriate notification.

Customers never see or configure the monitoring service, retailer adapters, proxy pools, polling intervals, database credentials, data-source configuration, or operator tooling.

V1 is alerts-only. Auto-Buy is future scope.

## 3. Platforms

Customer-facing products:

- Desktop: Electron application.
- Mobile: Expo / React Native companion application.

Internal product:

- Monitor service: developer/operator-only backend worker and CLI. It is not part of customer navigation or UX.

Desktop and mobile use the same account, products, alerts, preferences, and Recent history.

## 4. Canonical information architecture

There are exactly five customer-facing root destinations:

1. **Home**
2. **Browse**
3. **Alerts**
4. **Recent**
5. **Account**

Do not rename `Alerts` to `My Alerts`.

Desktop:
- persistent left sidebar
- all five root labels visible

Mobile:
- bottom tab bar
- same five root destinations

Detail/edit screens may sit above the root navigation but must provide a clear Back action.

No additional V1 root destinations.

## 5. Screen ownership

### Home — "What should I monitor?"

Home is recommendation/suggestion discovery only.

Home contains:
- `Home` heading
- one continuous `Suggested for You` product feed/grid
- curated products
- product cards
- Alert Me / Alert Set state
- optional notification-off banner
- loading state
- load-failure state

Home does **not** contain:
- product search
- shortcuts to Browse
- shortcuts to Alerts
- alert-management controls
- developer/operator controls

If recommendations cannot be personalized, use the curated suggestions fallback. There is no true Home empty state.

Optional banner:
`Notifications are off. You may miss alerts.`  
Action: `Turn On`

### Browse — "Can I find this product?"

Browse owns catalog lookup.

Browse contains:
- `Browse` heading
- search field
- full active curated catalog
- case-insensitive name filtering
- product cards/rows
- Alert Me / Alert Set state
- loading state
- load-failure state
- no-results state

Browse does **not** contain recommendations.

No-results copy:
`No products found.`  
`Try a different search.`

### Alerts — "What am I monitoring?"

Alerts is alert management.

Populated Alerts contains:
- heading `Alerts`
- top-right `Select`
- monitored products only
- image
- one-line product name with ellipsis
- threshold displayed as `$54.99 or less`
- pause/resume toggle at right
- row click opens Edit Alert

Do not add discovery/recommendation content to populated Alerts.

### Recent — "What happened?"

Recent is alert-event history.

Recent contains:
- heading exactly `Recent`
- secondary label `Last 14 Days`
- alert history grouped by local date
- `Today`
- `Yesterday`
- calendar-date grouping for older entries
- product image
- one-line product name
- hit price
- event time

### Account — settings/admin for the customer account

V1 Account contains:

Preferences:
- Notifications

Support:
- Help Center
- Contact Support

About:
- About
- Privacy Policy
- Terms

Account:
- Log Out

Do not add V1 settings for:
- Target Account
- purchase limits
- Stay Awake
- Auto-Buy
- Launch at Login
- proxy groups
- retailer source
- monitoring intervals

## 6. Primary customer flow

Canonical alert-creation paths:

`Home suggestion OR Browse result` → **Alert Me** creates the alert directly
with that product's displayed default threshold.

Clicking/tapping the product body instead opens `Product Details`, where
**Alert Me** creates the same alert. On every entry point, the server must
confirm creation before the UI shows `Alert created` or `✓ Alert Set`; the new
alert then appears under Alerts.

When a qualifying price is later observed:

internal monitor
→ Recent event
→ notification
→ Recent Detail

Notification tap opens Recent Detail.

## 7. Product cards

Product cards/rows may show:
- product image
- product name
- Target as retailer
- default/current threshold
- Alert Me / Alert Set state

Click/tap the product body to open Product Details. `Alert Me` is a separate
direct-create action and must not also navigate. `✓ Alert Set` is a status, not
a second create action; the product body still opens Product Details.

Threshold summary:
`Alert at $54.99 or less`

Already monitored:
`✓ Alert Set`

Do not show internal stock/debug terminology such as `stock loaded`.

## 8. Product Details

Route: `/products/:productId`

Contains:
- Back
- product image
- product name
- retailer `Target`
- alert threshold
- primary alert CTA
- secondary `Open at Target` link when `product_url` is available, per PLAN D16

Threshold sentence:
`Notify me when available at $54.99 or less`

Default primary CTA:
**Alert Me**

Creating:
- disable duplicate submission
- retain current screen
- show in-progress state

Successful creation:
- toast `Alert created`
- replace Alert Me with `✓ Alert Set`

Already monitored:
- show `✓ Alert Set`
- do not offer duplicate creation

Creation failure:
`Couldn't create alert.`  
Action: `Try Again`

Alert-limit failure (50 non-deleted alerts):
`You can monitor up to 50 products.`

Remain on the current screen, preserve its state, and do not show `Try Again`, a
success toast, or `✓ Alert Set`. The customer must remove an alert before another
can be created.

Retired product:
- render product information
- indicate that the product is no longer available for new monitoring
- show Back
- no Alert Me
- existing history may still render the retired product

Do not expose seller complexity to the customer. Marketplace sellers may qualify according to PLAN, but the customer-facing model stays "Target".

## 9. Alerts management

### Default rows

Each row:
- product image
- product name, one line, ellipsis if needed
- threshold, never truncated
- pause/resume toggle at right
- row opens Edit Alert

Paused alerts remain in the list.

Pause/resume is optimistic with rollback according to PLAN.

### Single delete

Mobile:
- swipe left to expose Delete

Desktop:
- hover/overflow menu
- right-click equivalent
- Delete key where appropriate

No confirmation modal.

Successful delete toast:
`Alert deleted    Undo`

Undo restores the soft-deleted alert.

Delete failure:
`Couldn't delete alert.`

On failure, the row must be restored.

### Select mode / bulk delete

Enter from:
`Select`

While selecting:
- `Cancel` replaces Select
- `Select All` available
- selection circles appear at far left
- product images remain visible
- price remains visible
- pause/resume toggles are hidden
- rows remain clickable for selection
- restrained red destructive action appears at bottom
- button label: `Delete (2)` or corresponding count

Successful bulk delete:
`2 alerts deleted    Undo`
Use the actual count.

### Alerts empty state

Canonical V1 behavior, locked by `PLAN.md`:

`No alerts yet.`  
`Start monitoring products you care about.`

Include a `Browse Products` button that routes to `/browse`.

This CTA is first-run guidance. The management-only rule applies to the populated Alerts list, not its empty state.

## 10. Edit Alert

Route: `/alerts/:alertId/edit`

Contains:
- Back
- product image
- product name
- retailer `Target`
- exactly one editable price threshold

Copy:
`Notify me when available at`

Input example:
`$54.99`

Suffix:
`or less`

Bottom action:
**Save**

Do not put these on Edit Alert:
- Delete
- pause/resume
- threshold presets
- additional settings

Invalid:
- input shows error styling
- text `Enter a valid price.`
- Save disabled

Saving:
- Save label `Saving...`
- prevent duplicate save

Success:
- return to Alerts
- toast `Alert updated`

Failure:
`Couldn't save changes.`  
Action: `Try Again`

Preserve the typed input after failure.

## 11. Recent

Route: `/recent`

Heading:
`Recent`

Secondary:
`Last 14 Days`

Group by local timezone:
- Today
- Yesterday
- date for older events

Recent empty:
`No alerts in the last 14 days.`

No CTA.

## 12. Recent Detail

Route: `/recent/:eventId`

Contains:
- Back
- product image
- product name
- price that triggered
- timestamp
- retailer
- primary `Open at Target` action when `product_url` is available, per PLAN D16

The event detail must represent the historical alert event, not a new "current price" lookup.

## 13. Notifications

### Notification content

Example:

Title:
`Prismatic Evolutions ETB`

Body:
`$52.99 at Target`

Tap/click:
→ `/recent/:eventId`

### Preference semantics

There is one account-wide notifications preference.

If disabled:
- no new mobile pushes are enqueued
- desktop suppresses native notifications
- Recent events are still recorded

### Mobile permission flow

Never request OS notification permission automatically on launch/login.

If permission is undetermined:
- Home shows the notifications banner
- `Turn On` requests permission

If granted:
- register push token
- hide permission banner

If denied:
- banner remains
- `Turn On` opens OS settings

### Desktop

Desktop can show native notifications only while the Electron app is running, including hidden-to-tray state.

If fully quit, there is no desktop server push. Mobile notifications remain independent.

## 14. Account / Notifications screen

Route:
`/account/notifications`

Contains:
- Back
- title `Notifications`
- `Push Notifications` / notification toggle using the account-wide preference

If OS notifications are unavailable/disabled:
`Notifications are off. Turn on notifications so you can receive price alerts.`  
Action:
`Open Settings`

## 15. Authentication

Minimal V1 auth only:
- email
- password
- sign in
- sign up
- form error

Email confirmation is disabled per PLAN.

Forgot-password, verification-pending, social login, onboarding, and magic-link UX are outside V1.

## 16. Global states

### Loading

Use skeletons matching the shape of the content being loaded.

### Network/load failure

Canonical generic load copy:
`Couldn't load content.`  
Action: `Try Again`

### Offline

`You're offline.`  
`Check your connection and try again.`  
Action: `Try Again`

### Mutation failures

Create:
`Couldn't create alert.`

Create at the 50-alert limit:
`You can monitor up to 50 products.`

The limit state has no `Try Again` action and never becomes a success state.

Update:
`Couldn't save changes.`

Delete:
`Couldn't delete alert.`

Do not show generic database/API error codes to customers.

## 17. Toast behavior

Exactly one toast visible at a time. A newer toast replaces the current one.

Success:
- duration 3000 ms
- desktop: top-right of content area
- mobile: top of screen

Undo:
- duration 6000 ms
- desktop: bottom of content area
- mobile: above tab bar
- includes `Undo`

Canonical messages:
- `Alert created`
- `Alert updated`
- `Alert deleted`
- `N alerts deleted`

## 18. Cross-device behavior

Desktop and mobile operate on the same cloud account.

Changes synchronize without requiring manual refresh:
- create alert
- edit threshold
- pause/resume
- delete/restore
- notifications preference
- Recent events

A change made on mobile should become visible on desktop and vice versa.

## 19. External retailer link behavior

`Open at Target` is allowed on:
- Product Details as secondary action
- Recent Detail as primary action

Open the system browser through the platform-safe external-link mechanism.

Customer notification flow must still land on Recent Detail first; do not make notification taps bypass Notify and open Target directly.

## 20. Product scope

V1:
- Pokémon products
- Target-focused
- US
- online-shipping availability
- alerts only

Explicitly outside V1 customer UX:
- Walmart
- GameStop
- Pokémon Center
- other retailer tabs
- Auto-Buy
- checkout automation controls
- retailer login/account storage
- queues/auto-queue
- in-store radar
- ZIP/store-specific availability
- purchase limits
- community watchlists/trending
- Discord
- market-price overlays
- drop calendar
- proxy settings
- monitor/operator settings

The schema may preserve future seams, but the UI must not expose them.

## 21. Customer-facing terminology

Use:
- Home
- Browse
- Alerts
- Recent
- Account
- Target
- Alert Me
- Alert Set

Avoid:
- My Alerts as root label
- Stock loaded
- OfferSource
- ProxyPool
- TCIN
- observation
- trigger state
- database role
- monitor health
- source breaker

Internal implementation terms never appear in customer-facing copy.

## 22. Visual behavior boundary

This document specifies behavior and hierarchy, not final pixel styling.

Final visual styling comes from `docs/UI_HANDOFF.md` and its referenced screenshots.

If a screenshot contains:
- obsolete copy
- legacy navigation
- legacy branding
- an excluded feature
- an interaction that contradicts this spec

implement the product behavior in this specification/PLAN and use the screenshot only for visual treatment.

## 23. Acceptance principle

A screen is not complete merely because it renders.

It must:
- own the correct customer question
- show only the controls assigned to it
- support every specified state
- use the canonical route
- use canonical copy
- obey desktop/mobile interaction differences
- preserve the five-root information architecture
- never expose internal monitoring/proxy/source implementation details
