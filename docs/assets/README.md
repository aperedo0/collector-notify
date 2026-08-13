# Notify asset handoff

This directory is the canonical home for production visual assets supplied to
the Notify implementation.

This inventory has no implementation authority and defers to the order in
`PLAN.md` Section 0.1.

## Inventory

- `logo/` — no production logo asset has been supplied. Use the product name
  `Notify` as text until an approved logo is provided.
- `product-images/` — no production product imagery has been supplied. The
  `products.image_url` field is nullable. When it is empty, render a neutral
  image placeholder; do not invent product art or crop it from the mockups.
- `icons/` — no custom production icon set has been supplied. Use the platform
  icons or icons already included by the approved scaffold. Adding another icon
  dependency still requires authorization under `PLAN.md` Section 0.2.

Release-quality application and tray icons remain human-supplied assets. A
development placeholder may be used for local milestone verification, but it
must not be presented as final Notify branding.

The PNG boards under `docs/mockups/desktop/` and `docs/mockups/mobile/` are
immutable visual references, not production assets. Do not copy UI-board crops
into these asset directories or ship the boards with the applications.
