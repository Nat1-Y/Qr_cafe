import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./tables/index";
import { config } from "dotenv";
config();

const connectionString =
  process.env.DATABASE_URL || "";

export const pool = new Pool({ connectionString, keepAlive: true });

// node-postgres emits 'error' on the Pool when an *idle* pooled client hits a
// network-level error (e.g. the remote host or a NAT/firewall silently drops
// a connection over the public internet link to this DB). With no listener,
// that's an uncaught exception that crashes the whole process — not just the
// query in flight. Log and let the pool recycle the dead client instead.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});

export const db = drizzle(pool, { schema });

export default db;
