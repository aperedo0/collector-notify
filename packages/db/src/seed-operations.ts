import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { migrationDatabaseUrl } from "./environment.ts";
import { migrateDatabase } from "./operations.ts";
import { SEED_PRODUCTS } from "./seed-data.ts";
import { fakeOffers, products } from "./schema.ts";

export async function seedDatabase(): Promise<void> {
  await migrateDatabase();
  await verifySeedDatabase();
}

export async function verifySeedDatabase(): Promise<void> {
  const client = postgres(migrationDatabaseUrl(), {
    max: 1,
    onnotice: () => undefined,
  });
  const database = drizzle(client);

  try {
    const seededProducts = await database
      .select({
        slug: products.slug,
        name: products.name,
        imageUrl: products.imageUrl,
        productUrl: products.productUrl,
        retailer: products.retailer,
        retailerProductId: products.retailerProductId,
        defaultAlertPriceCents: products.defaultAlertPriceCents,
        isActive: products.isActive,
        isSuggested: products.isSuggested,
        suggestedRank: products.suggestedRank,
        pollIntervalSeconds: products.pollIntervalSeconds,
        confirmObservations: products.confirmObservations,
      })
      .from(products)
      .where(
        inArray(
          products.slug,
          SEED_PRODUCTS.map((product) => product.slug),
        ),
      )
      .orderBy(products.slug);

    if (seededProducts.length !== SEED_PRODUCTS.length) {
      throw new Error(
        `Seed migration is incomplete: expected ${String(SEED_PRODUCTS.length)} products, found ${String(seededProducts.length)}.`,
      );
    }

    for (const [index, expected] of SEED_PRODUCTS.entries()) {
      const actual = seededProducts.find((product) => product.slug === expected.slug);
      const isSuggested = expected.suggestedRank !== null;
      const expectedRow = {
        slug: expected.slug,
        name: expected.name,
        imageUrl: null,
        productUrl: `https://www.target.com/p/notify-placeholder-${expected.slug}`,
        retailer: "target",
        retailerProductId: `notify-placeholder-${String(index + 1).padStart(2, "0")}`,
        defaultAlertPriceCents: expected.defaultAlertPriceCents,
        isActive: true,
        isSuggested,
        suggestedRank: expected.suggestedRank,
        pollIntervalSeconds: isSuggested ? 15 : 60,
        confirmObservations: 1,
      };

      if (JSON.stringify(actual) !== JSON.stringify(expectedRow)) {
        throw new Error(`Seed migration product mismatch: ${expected.slug}.`);
      }
    }

    const fakeOfferRows = await database
      .select({
        slug: products.slug,
        purchasable: fakeOffers.purchasable,
        bestPriceCents: fakeOffers.bestPriceCents,
      })
      .from(fakeOffers)
      .innerJoin(products, eq(fakeOffers.productId, products.id))
      .where(
        inArray(
          products.slug,
          SEED_PRODUCTS.map((product) => product.slug),
        ),
      );

    if (
      fakeOfferRows.length !== SEED_PRODUCTS.length ||
      fakeOfferRows.some(
        (offer) => offer.purchasable || offer.bestPriceCents !== null,
      )
    ) {
      throw new Error("Seed migration fake-offer rows are incomplete or invalid.");
    }
  } finally {
    await client.end();
  }
}
