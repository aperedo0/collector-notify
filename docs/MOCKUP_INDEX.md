# Notify Final Mockup Index

This is a human-readable index for the final screenshot handoff.

Do not implement from this file alone. Open each referenced PNG at full resolution.
This index has no independent authority and defers to `PLAN.md` Section 0.1.

## Desktop

| File | Main purpose |
|---|---|
| `docs/mockups/desktop/home-core-states.png` | Home suggestions, Alert Set, created toast, notifications banner |
| `docs/mockups/desktop/home-loading-failure-and-browse.png` | Home loading/failure, Browse default |
| `docs/mockups/desktop/browse-search-states.png` | Browse search, Alert Set, created toast, no results |
| `docs/mockups/desktop/browse-loading-failure-and-product-details.png` | Browse loading/failure, Product Details default |
| `docs/mockups/desktop/product-details-alert-states.png` | Product Details alert states |
| `docs/mockups/desktop/alerts-core-and-edit-entry.png` | Alerts default/empty, Edit Alert entry |
| `docs/mockups/desktop/edit-alert-states.png` | Edit Alert validation/saving/success/failure |
| `docs/mockups/desktop/alerts-delete-and-bulk-actions.png` | Delete, Undo, select mode, bulk delete/failure |
| `docs/mockups/desktop/recent-and-desktop-notification.png` | Recent, Recent empty, Recent Detail, notification example |
| `docs/mockups/desktop/account-and-notifications.png` | Account + Notifications |
| `docs/mockups/desktop/shared-system-states.png` | Reusable loading/network/offline |
| `docs/mockups/desktop/customer-flow-map.png` | Flow/navigation overview only |

## Mobile

| File | Main purpose |
|---|---|
| `docs/mockups/mobile/home-core-states.png` | Home suggestions, Alert Set, created toast, notification banner |
| `docs/mockups/mobile/home-loading-failure-and-browse.png` | Home loading/failure, Browse default |
| `docs/mockups/mobile/browse-search-states.png` | Browse search, Alert Set, created toast, no results |
| `docs/mockups/mobile/browse-loading-failure-and-product-details.png` | Browse loading/failure, Product Details default |
| `docs/mockups/mobile/product-details-alert-states.png` | Product Details alert states; ignore screenshot-only metadata/history |
| `docs/mockups/mobile/alerts-core-and-edit-entry.png` | Alerts default/empty/paused, Edit Alert entry |
| `docs/mockups/mobile/edit-alert-states.png` | Edit Alert states; ignore marketplace/type/delivery dropdown artifacts |
| `docs/mockups/mobile/alerts-delete-and-bulk-actions.png` | Swipe delete, Undo, select/bulk delete, failure |
| `docs/mockups/mobile/recent-and-push-notification.png` | Recent, Recent Detail, push; Target-only despite retailer examples |
| `docs/mockups/mobile/account-auth-and-shared-states.png` | Account, Notifications, Auth, shared states |

## Canonical screenshot locations

The repository uses:

```text
docs/mockups/desktop/<descriptive-name>.png
docs/mockups/mobile/<descriptive-name>.png
```

The exact canonical filenames are listed in the tables above and in
`docs/mockups/manifest.json`. Do not introduce ambiguous generated screenshot
filenames or competing versions.

## Important

Read `docs/UI_HANDOFF.md` before implementation. It contains the screenshot overrides that prevent accidental implementation of exploratory/legacy features.
