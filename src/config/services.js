import Redis from "ioredis";
import logger from "../utils/logger.js";

let redisClient = null;

// Validate and parse Redis config from env vars
function validateRedisConfig() {
  const required = ['REDIS_HOST', 'REDIS_PORT'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required Redis env vars: ${missing.join(', ')}`);
  }

  const config = {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true',
  };

  // Edge case: Warn if cloud host but no TLS
  if (config.host.includes('redis-cloud.com') && !config.tls) {
    logger.warn('Insecure Redis config: Cloud host without TLS enabled');
  }

  // Validate port is a number
  if (isNaN(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid REDIS_PORT: ${process.env.REDIS_PORT}`);
  }

  return config;
}

// Initialize Redis connection
async function initializeRedis() {
  try {
    const config = validateRedisConfig();

    const connectionOptions = {
      ...config,  // Spread host, port, username, password, tls
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 10000,  // Reduced from 20s for faster startup feedback
      keepAlive: 30000,  // Increased to 30s for cloud latency tolerance
      maxRetriesPerRequest: 3,  // Increased for transient cloud issues
      retryStrategy: (times) => {
        if (times > 5) return null;  // Exponential backoff, max 5 retries
        return Math.min(times * 200, 5000);  // Start at 200ms, cap at 5s
      },
      retryDelayOnFailover: 100,
      commandTimeout: 5000,  // Add per-command timeout to prevent hangs
      // TLS enhancements for cloud
      tls: config.tls ? {
        servername: config.host,
        rejectUnauthorized: process.env.NODE_ENV === 'production',  // Strict in prod, lenient in dev
        requestCert: true,
      } : undefined,
    };

    redisClient = new Redis(connectionOptions);

    redisClient.on("connect", () => {
      logger.info("Redis connected successfully", { host: config.host, tls: config.tls });
    });

    redisClient.on("error", (err) => {
      logger.warn("Redis connection error (retrying)", {
        error: err.message,
        host: config.host,
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
    try {
      await redisClient.quit();
    } catch (err) {
      logger.error("Error closing Redis connection", { error: err.message });
    }
    logger.info("Redis connection closed");
  }
}
