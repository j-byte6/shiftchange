import postgres from "postgres";

declare global {
  // Reused across hot reloads in development so we don't open a new pool each time.
  var __sql: ReturnType<typeof postgres> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
    // Keep shift dates and times as plain strings ("2026-11-02", "17:00") instead of JS Dates.
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      time: { to: 1083, from: [1083], serialize: (x: string) => x, parse: (x: string) => x.slice(0, 5) },
    },
  });
}

export const sql = globalThis.__sql ?? connect();
if (process.env.NODE_ENV !== "production") globalThis.__sql = sql;

export type Sql = typeof sql;
export type Tx = postgres.TransactionSql;
