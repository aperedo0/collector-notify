# Notify V1 UI Handoff

## 1. Purpose

This document tells the implementation agent how to use the final screenshot boards.

The complete repository authority order is defined in `PLAN.md` Section 0.1:

1. `PLAN.md`
2. `PRODUCT_SPEC.md`
3. `docs/UI_HANDOFF.md`
4. Tests
5. `AGENTS.md`
6. Implementation

Screenshots are **visual authority only**.

They may contain older copy, branding, examples, or exploratory controls. Those artifacts do not become requirements.

`docs/COMPETITOR_RESEARCH.md` is background only and has no implementation
authority.

## 2. Final screenshot filenames

The final images are stored in the repository exactly as follows:

```text
docs/mockups/
├── desktop/
│   ├── home-core-states.png
│   ├── home-loading-failure-and-browse.png
│   ├── browse-search-states.png
│   ├── browse-loading-failure-and-product-details.png
│   ├── product-details-alert-states.png
│   ├── alerts-core-and-edit-entry.png
│   ├── edit-alert-states.png
│   ├── alerts-delete-and-bulk-actions.png
│   ├── recent-and-desktop-notification.png
│   ├── account-and-notifications.png
│   ├── shared-system-states.png
│   └── customer-flow-map.png
│
└── mobile/
    ├── home-core-states.png
    ├── home-loading-failure-and-browse.png
    ├── browse-search-states.png
    ├── browse-loading-failure-and-product-details.png
    ├── product-details-alert-states.png
    ├── alerts-core-and-edit-entry.png
    ├── edit-alert-states.png
    ├── alerts-delete-and-bulk-actions.png
    ├── recent-and-push-notification.png
    └── account-auth-and-shared-states.png
```

Codex should open the board at full resolution. Do not use thumbnails/contact sheets as the primary implementation reference.

## 3. Brand normalization

The current product name is **Notify**.

Some screenshot boards say:
- Poké Watch
- Poke Watch
- PokéWatch

Treat those as legacy branding artifacts.

Do not rename:
- repo/package names;
- product copy;
- routes;
- notifications;
- window titles

to match legacy screenshot branding unless PLAN explicitly says to.

## 4. Visual direction

Use the screenshot layout language, with these final brand preferences:

- primary action: royal/cobalt blue;
- dark navigation: deep navy/charcoal;
- content surface: white/light neutral;
- text: dark navy/slate;
- secondary text: muted slate;
- destructive/error: red;
- warning: amber;
- success: restrained blue check / neutral dark toast;
- do not use bright green as a major product color;
- do not use bright purple as the primary brand color.

Desktop should feel desktop-native, not like a stretched phone app.

Mobile should feel touch-native and use bottom tabs.

## 5. Desktop screenshot map

### `desktop/home-core-states.png` — Home core

Shows:
- Home Suggestions
- Home Already Alerted
- Alert Created toast
- Notifications Disabled banner

Implement:
- Home suggestion-only semantics;
- `Alert Me`;
- `✓ Alert Set`;
- notification banner;
- toast placement.

Do not add search or alert-management shortcuts to Home.

### `desktop/home-loading-failure-and-browse.png` — Home states + Browse entry

Shows:
- Home Loading
- Home Load Failure
- Browse All Products

Use canonical `PLAN.md` / `PRODUCT_SPEC.md` error copy when screenshot copy differs.

### `desktop/browse-search-states.png` — Browse search

Shows:
- search results;
- already-alerted result;
- alert-created toast;
- no results.

Canonical no-results copy:
- `No products found.`
- `Try a different search.`

### `desktop/browse-loading-failure-and-product-details.png` — Browse system states + Product Details

Shows:
- Browse Loading
- Browse Load Failure
- Product Details default.

Product Details behavior comes from `PLAN.md` / `PRODUCT_SPEC.md`, including D16 link-out.

### `desktop/product-details-alert-states.png` — Product Details states

Shows:
- created toast;
- already alerted;
- create failure.

`PLAN.md` / `PRODUCT_SPEC.md` additionally require:
- creating state;
- retired-product state;
- secondary `Open at Target` when `product_url` is available.

If those are not visible on this board, implement them anyway.

### `desktop/alerts-core-and-edit-entry.png` — Alerts core + Edit entry

Shows:
- Alerts default;
- Alerts empty;
- Edit Alert default.

Important:
- Alerts is management-only when populated.
- Alert rows contain image/name/threshold/toggle.
- row opens Edit Alert.

The `Browse Products` CTA shown in the Alerts empty state is canonical per
`PLAN.md` and routes to `/browse`.

Canonical empty copy:
- `No alerts yet.`
- `Start monitoring products you care about.`

### `desktop/edit-alert-states.png` — Edit Alert states

Shows:
- invalid;
- saving;
- updated;
- update failure.

Canonical Edit Alert behavior:
- exactly one threshold field;
- `Notify me when available at`;
- price input;
- `or less`;
- Save only;
- no delete/pause/presets.

### `desktop/alerts-delete-and-bulk-actions.png` — Delete & bulk management

Shows:
- single-delete reveal;
- Undo;
- select mode;
- bulk delete;
- bulk Undo;
- delete failure.

Desktop interactions:
- hover/overflow;
- right-click;
- Delete key where appropriate;
- no confirmation modal.

### `desktop/recent-and-desktop-notification.png` — Recent

Shows:
- Recent list;
- Recent empty;
- Recent Detail;
- notification example.

Canonical behavior:
- Recent heading;
- Last 14 Days;
- Today / Yesterday / date grouping;
- Recent Detail is historical event detail;
- D16 requires primary `Open at Target` on Recent Detail.

If `Open at Target` is absent in the screenshot, implement it anyway.

### `desktop/account-and-notifications.png` — Account + Notifications

Shows:
- Account;
- Notifications enabled;
- Notifications OS-disabled.

Only V1 Account items from `PLAN.md` / `PRODUCT_SPEC.md` may be implemented.

### `desktop/shared-system-states.png` — Shared system states

Shows:
- loading skeleton;
- network failure;
- offline.

Canonical generic load failure:
- `Couldn't load content.`
- `Try Again`

Canonical offline:
- `You're offline.`
- `Check your connection and try again.`
- `Try Again`

### `desktop/customer-flow-map.png` — Flow map

Visual/navigation reference only.

It does not override the actual routing or milestone flow in PLAN.

## 6. Mobile screenshot map

### `mobile/home-core-states.png` — Home core

Shows:
- suggestions;
- already alerted;
- alert-created toast;
- notifications disabled banner.

Use the same Home product semantics as desktop.

Mobile uses bottom tabs:
`Home · Browse · Alerts · Recent · Account`

### `mobile/home-loading-failure-and-browse.png` — Home states + Browse entry

Shows:
- Home Loading;
- Home Load Failure;
- Browse All Products.

Use canonical generic load copy from `PLAN.md` / `PRODUCT_SPEC.md` when the image differs.

### `mobile/browse-search-states.png` — Browse search

Shows:
- search results;
- already alerted;
- created toast;
- no results.

Use Target-focused product semantics regardless of example imagery.

### `mobile/browse-loading-failure-and-product-details.png` — Browse system states + Product Details

Shows:
- Browse Loading;
- Browse Load Failure;
- Product Details default.

Product Details behavior must follow `PLAN.md` / `PRODUCT_SPEC.md`, not any extra fields visible in other mobile boards.

### `mobile/product-details-alert-states.png` — Product Details states

Use this board primarily for:
- mobile proportions;
- product hero layout;
- CTA placement;
- toast/failure treatment;
- creating/alert-set states.

**Known screenshot-only artifacts — DO NOT IMPLEMENT:**
- Market Price section;
- Price History graph;
- Set;
- Category;
- Release Date;
- generic Pokémon TCG metadata.

Canonical Product Details is simpler:
- product image;
- product name;
- Target;
- threshold sentence;
- Alert Me / Alert Set;
- secondary `Open at Target`;
- failure/creating/retired states.

### `mobile/alerts-core-and-edit-entry.png` — Alerts core + Edit entry

Use for:
- alert row spacing;
- toggles;
- paused row;
- empty-state proportions;
- Edit Alert layout.

The `Browse Products` CTA shown in Alerts empty is canonical per `PLAN.md` and
routes to `/browse`.

### `mobile/edit-alert-states.png` — Edit Alert states

Use this board for:
- validation styling;
- saving treatment;
- success toast;
- failure treatment;
- bottom Save placement.

**Known screenshot-only artifacts — DO NOT IMPLEMENT:**
- `Marketplace: TCGPlayer`;
- Alert Type dropdown;
- `Price Drop`;
- Notify Me / delivery-method dropdown.

Canonical Edit Alert contains **one threshold field + Save only**.

### `mobile/alerts-delete-and-bulk-actions.png` — Delete & bulk management

Use this board for:
- swipe-left delete affordance;
- Undo toast;
- select mode;
- bulk destructive action;
- delete failure.

**Do not copy event-history semantics into Alerts.**
If the board shows `Today` or timestamps on alert-management rows, ignore them.

Alerts owns management.
Recent owns event history/timestamps.

### `mobile/recent-and-push-notification.png` — Recent + push

Use for:
- Recent mobile row layout;
- empty state;
- Recent Detail;
- mobile push notification.

**Known screenshot artifact:** some example rows mention Best Buy/Walmart. Notify V1 is Target-only. Replace all retailer examples with Target.

Canonical Recent Detail must include:
- product;
- hit price;
- timestamp;
- Target;
- primary `Open at Target`.

### `mobile/account-auth-and-shared-states.png` — Account, Notifications, Auth, shared states

Use for:
- Account grouping/layout;
- Notifications screen;
- OS-disabled state;
- Auth form proportions;
- shared system-state styling.

**Known screenshot-only artifacts — DO NOT IMPLEMENT:**
- profile/avatar/persona section unless explicitly authorized;
- Forgot password;
- Pokémon/Pokéball branded artwork as a product requirement.

V1 auth is only:
- email;
- password;
- sign in;
- sign up;
- form error.

## 7. Cross-board behavioral overrides

These rules apply to all screenshots:

### Never implement from screenshot alone

Do not add:
- Walmart;
- Best Buy;
- GameStop;
- TCGPlayer marketplace controls;
- Auto-Buy;
- Target account/login controls;
- purchase limits;
- queue controls;
- Local Radar;
- drop calendar;
- community/trending;
- Discord;
- proxy settings;
- monitor settings;
- Alert Type dropdowns;
- delivery-method dropdowns;
- price-history features;
- market-price features;
- category/set/release-date metadata;
- forgot-password flow;
- profile editing.

### Retailer

Customer-facing V1 retailer is Target.

Marketplace sellers may qualify internally according to PLAN, but customer UI stays simple.

### D16

Regardless of old screenshots:
- Product Details has secondary `Open at Target`;
- Recent Detail has primary `Open at Target`;
- notification tap/click lands on Recent Detail first.

### Error copy

When screenshot-specific copy conflicts with `packages/config/strings.ts`, `PLAN.md`, or `PRODUCT_SPEC.md`, use the canonical strings, not the screenshot wording.

The 50-alert creation limit uses `You can monitor up to 50 products.` It keeps
the customer on the current screen and has no `Try Again` action. This behavior
is contractual even when a screenshot shows only the generic create failure.

### Alerts vs Recent

Alerts:
- management;
- threshold;
- pause/resume;
- edit;
- delete.

Recent:
- historical alert hits;
- timestamps;
- date grouping.

Do not mix these screen responsibilities.

## 8. UI implementation procedure

For every UI milestone:

1. Read PLAN completely for that milestone.
2. Read the matching `PRODUCT_SPEC.md` screen section.
3. Read this board mapping.
4. Open the full-resolution board.
5. List the visual states visible.
6. List any known screenshot-only artifacts before coding.
7. Implement the canonical behavior.
8. Match the screenshot's spacing/layout/hierarchy.
9. Verify every required state.
10. Include material visual differences in the milestone completion report.

## 9. When to STOP

STOP and report instead of guessing if:
- a screenshot appears to require behavior not covered here;
- `PLAN.md` and `PRODUCT_SPEC.md` disagree;
- required UI behavior is missing from both `PLAN.md` and `PRODUCT_SPEC.md`;
- a screenshot-only feature appears important but is not listed as an allowed V1 feature.
