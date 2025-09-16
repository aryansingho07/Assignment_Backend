import express from 'express';
import { getRedisClient } from '../config/services.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Database connectivity check
router.get('/db', async (req, res) => {
  const checks = {};
  let overallStatus = 'healthy';

  // Check Redis
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      checks.redis = { status: 'connected', latency: 'low' };
    } else {
      checks.redis = { status: 'disconnected', error: 'Redis client not initialized' };
      overallStatus = 'degraded';
    }
  } catch (error) {
    checks.redis = { status: 'error', error: error.message };
    overallStatus = 'unhealthy';
  }

  res.status(overallStatus === 'unhealthy' ? 503 : 200).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  });
});

// Comprehensive service health check
router.get('/services', async (req, res) => {
  const checks = {};
  let overallStatus = 'healthy';

  // Check Redis
  try {
    const redis = getRedisClient();
    if (redis) {
      const start = Date.now();
      await redis.ping();
      const latency = Date.now() - start;
      checks.redis = { 
        status: 'connected', 
        latency: `${latency}ms`,
        connected: true,
      };
    } else {
      checks.redis = { 
        status: 'disconnected', 
        error: 'Redis client not initialized',
        connected: false,
      };
      overallStatus = 'degraded';
    }
  } catch (error) {
    checks.redis = { 
      status: 'error', 
      error: error.message,
      connected: false,
    };
    overallStatus = 'unhealthy';
  }

  // Check environment variables
  const requiredEnvVars = ['GEMINI_API_KEY'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  checks.environment = {
    status: missingEnvVars.length === 0 ? 'configured' : 'misconfigured',
    missingVariables: missingEnvVars,
  };

  if (missingEnvVars.length > 0) {
    overallStatus = 'degraded';
  }

  // Check system resources
  const memUsage = process.memoryUsage();
  const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  checks.system = {
    status: memUsagePercent > 90 ? 'high_memory' : 'normal',
    memory: {
      used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      percentage: `${Math.round(memUsagePercent)}%`,
    },
    uptime: `${Math.round(process.uptime())}s`,
  };

  if (memUsagePercent > 90) {
    overallStatus = 'degraded';
  }

  const statusCode = overallStatus === 'unhealthy' ? 503 : 
                    overallStatus === 'degraded' ? 200 : 200;

  res.status(statusCode).json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  });
});

export default router;