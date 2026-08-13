# Competitor research: Guppy, gap by gap

Background only. The engineering decisions extracted from this research are D16 through D20 in PLAN.md (D21 to D23 are Notify's own engineering decisions, not competitor-derived); this file carries no implementation authority.

Guppy ("Guppy: Collector Copilot", DropKit Inc. / Guppy Labs, guppy.so) is the closest competitor: collector drop and restock alerts plus automated checkout for Pokemon, TCG, and consoles across Walmart, Target, GameStop, Sam's Club, and others. iOS and Android apps, a Chrome extension, and a new macOS/Windows desktop app. Findings below are from their App Store and Play Store listings, guppy.so, and their Chrome Web Store listing as of Aug 2026. Each open implementation question from the original spec review is resolved to what Guppy observably does.

| Gap | What Guppy does (observed) | Notify adoption |
|---|---|---|
| Product/alert model | Watch a product with a user-set max price; alerts on restocks and price drops; "price guardrails"; quantity controls per mission | Identical to the existing threshold model ("$54.99 or less"). Validated; unchanged. One condition (eligible offer at or below threshold) covers both their restock and price-drop alert types. |
| Getting retailer data | Cloud-side monitoring 24/7 with "instant" alerts when inventory flips; store-level Local Radar described as powered by a "premium retail feed" (procurement model unverified; see confidence labels); community "swarm" confirmations to cut false alarms; their browser extension also observes queue and stock state inside real user sessions | D19: at M9 evaluate a commercial feed first (`FeedOfferSource`), own adapter second. D18: `CONFIRM_OBSERVATIONS` gate as the single-source stand-in for swarm confirmation. Extension-style community sensing: post-V1 idea only. |
| Re-alert / cooldown | Not published. Observable posture: alerts fire on state flips and they invest in false-alarm reduction | Keep the edge-triggered arming + 30 min cooldown + confirmation counter. This is the engineered version of their observable behavior. |
| Alert delivery + tap behavior | Mobile push, one clean in-app feed of events, and alerts link out to retailer product pages (they earn affiliate commission on click-throughs) | D16: push tap -> Recent Detail -> primary "Open at Target" (`product_url`). Affiliate parameters are a config seam to add later. |
| Desktop story | Dedicated desktop app (macOS, Windows), required for automation; automation runs locally in the user's own browser session; credentials never leave the device; started as a Chrome extension and moved to a desktop app after reliability problems | Validates the Electron plan and D8 (main-process realtime notifications). D20 locks the future Auto-Buy posture: local agent, user's own session, zero cloud credentials, skip the extension detour. |
| Tiers and limits | Web pricing: Basic $7.99/mo (alerts, radar, market overlays, Discord), Plus $12.99/mo (auto-checkout, auto-queue, priority alerts), annual saves up to 27%; iOS IAP: Pro $14.99/mo or $149.99/yr; free app tier exists with basic alerts; priority alerts appear as a paid perk on some surfaces (official surfaces conflict; see confidence labels); one account per person; US retailers only | D17: `plan` column + plan-ordered dispatch now, everything free in V1. US-only scope. Account dedup and paid checkout land with monetization, not V1. |
| Internals (schema, API layer, undo UX, state libraries) | Not observable anywhere public | Keep PLAN decisions D1, D3, D5, D10. These are engineering choices Guppy does not expose. |

Guppy features deliberately NOT in Notify V1 (the schema already leaves room): queue join/queue alerts, drop calendar with exact drop times, in-store Local Radar, eBay market price overlays, community watchlist/trending, Discord community. `recent_events.type` and the products table absorb these later without redesign.

## Confidence labels (added after external review)

Directly stated on Guppy's own surfaces (high confidence): max-price watch and auto-buy missions with quantity controls; auto-checkout on Walmart and Target requiring the desktop app; automation running locally in the user's browser session with no cloud credentials; Smart Alerts, Local Radar, Drop Calendar; the phrase "premium retail feed" powering Local Radar (guppy.so homepage copy); the phrase "community confirmations that reduce noise and false alarms" describing Swarm Signals (Guppy's Chrome Web Store listing); US-only scope; Basic $7.99/mo and Plus $12.99/mo on the web pricing surface; Pro $14.99/mo or $149.99/yr as iOS in-app purchase.

Inference, medium confidence (do not treat as observed fact):
- That the "premium retail feed" is a paid third-party license rather than in-house data. Their copy says "premium retail feed"; the procurement model is inferred.
- That Guppy moved from the Chrome extension to the desktop app BECAUSE the extension was unreliable. The desktop app is real and newer, and one App Store review attributes the improvement to it, but no official source states that causal history.
- That Swarm Signals act as a confirmation gate inside their monitoring pipeline. The marketing claim (noise and false-alarm reduction) is official; the pipeline mechanism is inferred. Notify's `confirm_observations` gate is an engineered analog, not a copy of a known mechanism.

Corroborated secondhand, Aug 2026 (app.guppy.so/pricing is client-rendered and returns an empty shell to direct fetch here; two independent reviews of the live page report the same numbers): Basic $7.99/mo with 10 Watch missions and priority push alerts; Plus $12.99/mo with up to 15 simultaneous Auto-Buy missions.

Confirmed discrepancy: as of Aug 2026 Guppy's official surfaces conflict on priority-alert entitlement (homepage places "Priority alerts" under Plus; the pricing page lists "Priority push alerts" under Basic). Do not infer exact tier entitlements from Guppy.

Citation note: the phrase "premium retail feed" was observed verbatim in guppy.so homepage roadmap copy (Local Radar entry) as fetched Aug 2026; retain that phrase as observed with this date. Only the procurement interpretation (paid third-party license) remains inference.
