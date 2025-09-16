import logger from "../utils/logger.js";

export function validateEnvironment() {
  const requiredEnvVars = [
    "GEMINI_API_KEY",
    "JINA_API_KEY",
    "QDRANT_URL",
    "QDRANT_API_KEY",
  ];

  const missingVars = [];
  const warnings = [];

  // Check required variables
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  // Check optional but recommended variables
  if (!process.env.REDIS_URL) {
    warnings.push("REDIS_URL not set - using in-memory session storage");
  }

  if (!process.env.NEWS_API_KEY) {
    warnings.push("NEWS_API_KEY not set - NewsAPI will be skipped");
  }

  if (!process.env.GUARDIAN_API_KEY) {
    warnings.push("GUARDIAN_API_KEY not set - Guardian API will be skipped");
  }

  // Log warnings
  if (warnings.length > 0) {
    logger.warn("Environment warnings:", warnings);
  }

  // Throw error for missing required variables
  if (missingVars.length > 0) {
    const error = new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
    logger.error("Environment validation failed:", error.message);
    throw error;
  }

  logger.info("Environment validation passed");
  return true;
}

export function getConfig() {
  return {
    // Server
    port: parseInt(process.env.PORT || "5050", 10),
    nodeEnv: process.env.NODE_ENV || "development",

    // AI Services
    gemini: {
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    },

    // Embeddings
    jina: {
      apiKey: process.env.JINA_API_KEY,
      model: process.env.JINA_MODEL || "jina-embeddings-v2-base-en",
    },

    // Vector Database
    qdrant: {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: process.env.QDRANT_COLLECTION || "news_articles",
    },

    // Redis
    redis: {
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD,
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
    },

    // News APIs
    newsAPIs: {
      newsAPI: {
        key: process.env.NEWS_API_KEY,
      },
      guardian: {
        key: process.env.GUARDIAN_API_KEY,
      },
    },

    // RSS Configuration
    rss: {
      maxPerFeed: parseInt(process.env.RSS_MAX_PER_FEED || "1000", 10),
      maxTotal: parseInt(process.env.RSS_MAX_TOTAL || "100000", 10),
      timeout: parseInt(process.env.RSS_TIMEOUT || "10000", 10),
    },

    // Rate Limiting
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX || "100", 10), // 100 requests per window
    },
  };
}
