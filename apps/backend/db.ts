import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[db] DATABASE_URL is not set!");
}

// Configure PostgreSQL connection pool with aggressive keep-alive and idle connection management
// to prevent serverless dropouts (e.g. Neon connection pooler timeouts)
export const pool = new Pool({
  connectionString: connectionString || "",
  max: 10,
  idleTimeoutMillis: 15000, // Close idle connections before server drops them
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000, // TCP keepalive probes every 5s
});

pool.on("error", (err) => {
  console.warn("[db-pool] Idle PostgreSQL client socket error (handled):", err.message);
});

const adapter = new PrismaPg(pool);

// Base Prisma Client
const basePrisma = new PrismaClient({
  adapter,
});

/**
 * Resilient Prisma client that automatically retries once if a cloud/serverless
 * connection was silently dropped (ERR_SOCKET_CLOSED, ECONNRESET, connection terminated).
 */
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        try {
          return await query(args);
        } catch (err: any) {
          const msg = String(err?.message || "");
          const isSocketDrop =
            msg.includes("ERR_SOCKET_CLOSED") ||
            msg.includes("ECONNRESET") ||
            msg.includes("Connection terminated") ||
            msg.includes("Connection lost") ||
            msg.includes("closed unexpectedly");

          if (isSocketDrop) {
            console.warn(
              `[prisma-retry] Recovered from socket drop on ${String(model)}.${operation}. Retrying query with fresh connection...`,
            );
            return await query(args);
          }
          throw err;
        }
      },
    },
  },
}) as unknown as PrismaClient;