export type SeedProduct = {
  slug: string;
  name: string;
  retailerProductId: string;
  defaultAlertPriceCents: number;
  suggestedRank: number | null;
};

export const SEED_PRODUCTS: readonly SeedProduct[] = [
  {
    slug: "prismatic-evolutions-etb",
    name: "Prismatic Evolutions Elite Trainer Box",
    retailerProductId: "notify-placeholder-01",
    defaultAlertPriceCents: 5499,
    suggestedRank: 1,
  },
  {
    slug: "destined-rivals-etb",
    name: "Destined Rivals Elite Trainer Box",
    retailerProductId: "notify-placeholder-02",
    defaultAlertPriceCents: 5499,
    suggestedRank: 2,
  },
  {
    slug: "151-booster-bundle",
    name: "151 Booster Bundle",
    retailerProductId: "notify-placeholder-03",
    defaultAlertPriceCents: 2999,
    suggestedRank: 3,
  },
  {
    slug: "journey-together-etb",
    name: "Journey Together ETB",
    retailerProductId: "notify-placeholder-04",
    defaultAlertPriceCents: 4999,
    suggestedRank: 4,
  },
  {
    slug: "charizard-ex-premium",
    name: "Charizard ex Premium Collection",
    retailerProductId: "notify-placeholder-05",
    defaultAlertPriceCents: 7999,
    suggestedRank: null,
  },
  {
    slug: "charizard-ex-super-premium",
    name: "Charizard ex Super-Premium Collection",
    retailerProductId: "notify-placeholder-06",
    defaultAlertPriceCents: 8999,
    suggestedRank: null,
  },
  {
    slug: "charizard-ex-ultra-premium",
    name: "Charizard ex Ultra-Premium Collection",
    retailerProductId: "notify-placeholder-07",
    defaultAlertPriceCents: 11999,
    suggestedRank: null,
  },
  {
    slug: "charizard-ex-special",
    name: "Charizard ex Special Collection",
    retailerProductId: "notify-placeholder-08",
    defaultAlertPriceCents: 3999,
    suggestedRank: null,
  },
] as const;
