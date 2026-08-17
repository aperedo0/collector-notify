import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  LOCAL_MIGRATION_URL,
  assertLocalResetTarget,
  assertLocalResetUrl,
  describeDatabaseTarget,
  migrationDatabaseUrl,
  runtimeProcess,
} from "../src/environment.ts";

const LOCAL_LOCALHOST_URL =
  "postgresql://notify_migrator:notify_local_migrator@localhost:54329/notify";

// Each of these is a documented bypass attempt against the local-only guard:
// a URL the tightened regex must reject, because the driver's own parser
// (WHATWG `URL`) resolves it to a non-local target that the raw string
// disguises. Reused below to drive `assertLocalResetTarget` with the
// driver's actual parsed options for the same URLs.
const BYPASS_URLS = [
  [
    "a '#' terminating the authority before the real host",
    "postgresql://evil.example.com#@127.0.0.1:54329/notify",
  ],
  [
    "an '@' inside the query string",
    "postgresql://u:p@ep.neon.tech/notify?x=@127.0.0.1:54329/notify",
  ],
  [
    "a second, non-local host in a multihost URL",
    "postgresql://u:p@127.0.0.1:54329,evil.example.com:5432/notify",
  ],
  [
    "a missing port, which defaults away from the local instance's port",
    "postgresql://u:p@127.0.0.1/notify",
  ],
  [
    "a non-local database name on an otherwise-local host and port",
    "postgresql://u:p@127.0.0.1:54329/customer_data",
  ],
] as const;

describe("migrationDatabaseUrl", () => {
  it("throws when DATABASE_MIGRATION_URL is present but blank", () => {
    const previousValue = runtimeProcess.env.DATABASE_MIGRATION_URL;
    runtimeProcess.env.DATABASE_MIGRATION_URL = "";
    try {
      expect(() => migrationDatabaseUrl()).toThrow(
        "Missing required environment variable: DATABASE_MIGRATION_URL",
      );
    } finally {
      if (previousValue === undefined) {
        delete runtimeProcess.env.DATABASE_MIGRATION_URL;
      } else {
        runtimeProcess.env.DATABASE_MIGRATION_URL = previousValue;
      }
    }
  });

  it("falls back to the local reset URL when DATABASE_MIGRATION_URL is unset", () => {
    const previousValue = runtimeProcess.env.DATABASE_MIGRATION_URL;
    delete runtimeProcess.env.DATABASE_MIGRATION_URL;
    try {
      expect(migrationDatabaseUrl()).toBe(LOCAL_MIGRATION_URL);
    } finally {
      if (previousValue !== undefined) {
        runtimeProcess.env.DATABASE_MIGRATION_URL = previousValue;
      }
    }
  });
});

describe("assertLocalResetUrl", () => {
  it("accepts the local reset URL", () => {
    expect(() => assertLocalResetUrl(LOCAL_MIGRATION_URL)).not.toThrow();
  });

  it("accepts the localhost form", () => {
    expect(() => assertLocalResetUrl(LOCAL_LOCALHOST_URL)).not.toThrow();
  });

  it.each(BYPASS_URLS)("rejects a URL with %s", (_description, url) => {
    expect(() => assertLocalResetUrl(url)).toThrow("local/test-only");
  });
});

describe("describeDatabaseTarget", () => {
  it("strips credentials from the local reset URL", () => {
    expect(describeDatabaseTarget(LOCAL_MIGRATION_URL)).toBe(
      "127.0.0.1:54329/notify",
    );
  });

  it("cuts the query string before stripping userinfo, even when the query contains '@'", () => {
    const urlWithAtInQuery =
      "postgresql://notify_migrator:notify_local_migrator@127.0.0.1:54329/notify?application_name=a@b";
    expect(describeDatabaseTarget(urlWithAtInQuery)).toBe(
      "127.0.0.1:54329/notify",
    );
  });
});

// `assertLocalResetTarget` reads postgres.js's own parsed options, not the
// URL string, so it cannot be exercised through URLs alone: every bypass URL
// above is already rejected by `assertLocalResetUrl`'s regex, and every URL
// the regex accepts parses to correct options. These tests call it directly
// — with the driver's real parsed options for both accepted and bypass URLs,
// plus two hand-built option shapes (a unix socket, a matching-port
// multihost) that no URL can produce — to prove the options check itself has
// teeth, independent of the regex.
describe("assertLocalResetTarget", () => {
  it("accepts the local reset URL's own parsed options", async () => {
    const client = postgres(LOCAL_MIGRATION_URL);
    try {
      expect(() => assertLocalResetTarget(client.options)).not.toThrow();
    } finally {
      await client.end();
    }
  });

  it.each(BYPASS_URLS)(
    "rejects the driver's parsed options for a URL with %s",
    async (_description, url) => {
      const client = postgres(url);
      try {
        expect(() => assertLocalResetTarget(client.options)).toThrow(
          "local/test-only",
        );
      } finally {
        await client.end();
      }
    },
  );

  it("rejects a unix-socket target even when host/port/database look local", async () => {
    // No URL produces this: postgres.js only sets `path` for an explicit
    // unix-socket option, never by parsing a `postgresql://` URL.
    const client = postgres(LOCAL_MIGRATION_URL);
    try {
      const unixSocketOptions = {
        ...client.options,
        path: "/var/run/postgresql/.s.PGSQL.5432",
      };
      expect(() => assertLocalResetTarget(unixSocketOptions)).toThrow(
        "local/test-only",
      );
    } finally {
      await client.end();
    }
  });

  it("rejects a multihost target even when the first host is local", async () => {
    // Keeps the single-element `port: [54329]` from the spread so this
    // isolates the host-length check: a URL-derived multihost target also
    // carries two ports and would be caught by the port check instead.
    const client = postgres(LOCAL_MIGRATION_URL);
    try {
      const multihostOptions = {
        ...client.options,
        host: ["127.0.0.1", "evil.example.com"],
      };
      expect(() => assertLocalResetTarget(multihostOptions)).toThrow(
        "local/test-only",
      );
    } finally {
      await client.end();
    }
  });
});
