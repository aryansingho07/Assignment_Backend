import Redis from "ioredis";
import logger from "../utils/logger.js";

let redisClient = null;

// Initialize Redis connection
async function initializeRedis() {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    // Parse URL to construct robust TLS options for managed Redis providers
    const url = new URL(redisUrl);
    const isTLS = url.protocol === "rediss:";

    const connectionOptions = {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : 6379,
      username: url.username || undefined,
      password: url.password || undefined,
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 20000,
      keepAlive: 1,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 1000, 3000),
      retryDelayOnFailover: 100,
      tls: isTLS
        ? {
            // Ensure SNI matches managed Redis certificates
            servername: url.hostname,
            // Some providers use custom CAs; do not block startup when certs are custom
            rejectUnauthorized: false,
          }
        : undefined,
    };

    redisClient = new Redis(connectionOptions);

    redisClient.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    redisClient.on("error", (err) => {
      // Soft-fail Redis: log once per process and keep running
      logger.warn("Redis connection error (continuing without Redis)", {
        error: err.message,
      });
    });

    redisClient.on("close", () => {
      logger.warn("Redis connection closed");
    });

    // Test connection
    await redisClient.ping();
    logger.info("Redis ping successful");

    return redisClient;
  } catch (error) {
    logger.error("Failed to initialize Redis:", error);
    // Cleanly disconnect and fall back to in-memory storage
    try {
      if (redisClient) {
        redisClient.disconnect();
      }
    } catch {}
    redisClient = null;
    // Don't fail startup if Redis is not available
    return null;
  }
}

// Initialize all external services
export async function initializeServices() {
  logger.info("Initializing external services...");

  // Initialize Redis
  try {
    await initializeRedis();
  } catch (err) {
    logger.warn("Redis initialization failed, proceeding without it", {
      error: err?.message,
    });
  }

  logger.info("Services initialization completed");
}

// Get Redis client instance
export function getRedisClient() {
  return redisClient;
}

// Graceful shutdown
export async function closeServices() {
  if (redisClient) {
    await redisClient.quit();
    logger.info("Redis connection closed");
  }
}
