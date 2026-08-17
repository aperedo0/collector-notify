import type { ParsedOptions } from "postgres";

type RuntimeProcess = {
  cwd: () => string;
  env: Record<string, string | undefined>;
  stdout: { write: (message: string) => void };
};

const candidateProcess = (globalThis as { process?: RuntimeProcess }).process;

export const runtimeProcess: RuntimeProcess = (() => {
  if (candidateProcess === undefined) {
    throw new Error("@notify/db requires a Node.js runtime.");
  }
  return candidateProcess;
})();

export const LOCAL_MIGRATION_URL =
  "postgresql://notify_migrator:notify_local_migrator@127.0.0.1:54329/notify";

export function migrationDatabaseUrl(): string {
  const value = runtimeProcess.env.DATABASE_MIGRATION_URL;
  // Unset (not passed at all) keeps the local fallback so every local `db:*`
  // command keeps working with no environment set up. Present-but-blank is a
  // different situation — §5's own `.env` template ships
  // `DATABASE_MIGRATION_URL=` empty, and `??` does not catch `""` — so it must
  // throw instead of silently resolving to whatever `postgres.js` falls back
  // to (the OS user against the OS-named database on `localhost:5432`).
  if (value === undefined) {
    return LOCAL_MIGRATION_URL;
  }
  if (value.trim().length === 0) {
    throw new Error(
      "Missing required environment variable: DATABASE_MIGRATION_URL",
    );
  }
  return value;
}

// Strips userinfo (username and password) from a Postgres connection URL so
// entry points can print which host/database they acted on without leaking
// credentials. Uses `slice`, not `new URL()`: TypeScript has no type
// declaration for the global `URL` under this package's `lib: ["ES2024"]`
// with no `@types/node`, so `new URL()` fails to compile (it would work fine
// at runtime). `lastIndexOf` still works when the password contains "@",
// and degrades to the full URL when there is no userinfo to strip.
export function describeDatabaseTarget(url: string): string {
  // Cut the query string / fragment off first, then strip userinfo from what
  // remains. Order matters: a query string can itself contain "@" (for
  // example `?application_name=a@b`), and stripping userinfo first would
  // find that "@" instead of the real one before the host.
  // Accepted edge case: a raw, unescaped "#" inside a password (`u:pa#ss@…`)
  // makes this print a truncated `postgresql://u:pa` — that URL is already
  // illegal, and the three non-reset callers of this function only ever see
  // hosted URLs a human typed, so it is accepted rather than handled.
  const queryOrFragmentIndex = url.search(/[?#]/);
  const withoutQueryOrFragment =
    queryOrFragmentIndex === -1 ? url : url.slice(0, queryOrFragmentIndex);
  return withoutQueryOrFragment.slice(
    withoutQueryOrFragment.lastIndexOf("@") + 1,
  );
}

const LOCAL_RESET_ONLY_MESSAGE =
  "db:reset is local/test-only and requires the local Notify PostgreSQL database.";

export function assertLocalResetUrl(databaseUrl: string): void {
  // Userinfo excludes "?" and "#": WHATWG `URL` (which postgres.js uses to
  // parse a connection string) treats an unescaped "#" as the start of a
  // fragment and terminates the authority there, so
  // `postgresql://evil.example.com#@127.0.0.1:54329/notify` would otherwise
  // read as a local URL by this regex while the driver dials
  // `evil.example.com`. The port is required and pinned to the local
  // instance's exact port so `…@127.0.0.1/notify` (defaulting to 5432)
  // cannot pass. This regex is a cheap pre-check only — `assertLocalResetTarget`
  // below, which reads the driver's own parsed options, is what actually
  // gates `DROP SCHEMA`.
  const localDatabasePattern =
    /^postgres(?:ql)?:\/\/[^/@?#]+(?::[^/@?#]*)?@(?:127\.0\.0\.1|localhost):54329\/notify(?:\?.*)?$/;

  if (!localDatabasePattern.test(databaseUrl)) {
    throw new Error(LOCAL_RESET_ONLY_MESSAGE);
  }
}

// Asserts on postgres.js's own parsed connection options rather than on the
// URL string. `options.host`/`.port`/`.database`/`.path` is literally the
// array the driver hands to `socket.connect()`
// (postgres@3.4.9/src/connection.js:350-356), so this is not a second parser
// that could disagree with the driver — it is the driver's own parse result,
// checked before any socket opens.
//
// A post-connect `select inet_server_addr() <<= inet '127.0.0.1/32'` was
// rejected: measured against the only supported setup, the server reports
// its Docker bridge address (`172.18.0.2/32`), so that check would throw on
// every legitimate `pnpm db:reset`. It also answers the wrong question — is
// the *server's* address loopback — not which server it is, so an
// `ssh -L` tunnel terminating on the remote's own loopback would pass it.
export function assertLocalResetTarget(options: ParsedOptions): void {
  const isLocalHost =
    options.host.length === 1 &&
    (options.host[0] === "127.0.0.1" || options.host[0] === "localhost");
  const isLocalPort = options.port.length === 1 && options.port[0] === 54329;
  const isLocalDatabase = options.database === "notify";
  // postgres.js sets `path` to the boolean `false` (not `undefined`) when no
  // unix-socket target was requested (postgres@3.4.9/src/index.js:468),
  // while its own types declare `path: string | undefined`. An
  // `options.path !== undefined` comparison typechecks against that type and
  // would throw on every legitimate reset, so this must be a truthiness
  // test: a unix-socket target must be refused, and `false` must not.
  const isNotUnixSocketTarget = !options.path;

  if (!isLocalHost || !isLocalPort || !isLocalDatabase || !isNotUnixSocketTarget) {
    throw new Error(LOCAL_RESET_ONLY_MESSAGE);
  }
}
