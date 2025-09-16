import { getRedisClient } from '../config/services.js';
import logger from '../utils/logger.js';

export class SessionManager {
  constructor() {
    this.redis = null;
    this.sessionTTL = parseInt(process.env.CHAT_HISTORY_TTL) || 86400; // 24 hours
    this.fallbackStorage = new Map(); // In-memory fallback
  }

  async initialize() {
    this.redis = getRedisClient();
  }

  // Create a new session
  async createSession(sessionId) {
    try {
      const sessionData = {
        id: sessionId,
        created: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        messageCount: 0,
      };

      if (this.redis) {
        await this.redis.setex(
          `session:${sessionId}`,
          this.sessionTTL,
          JSON.stringify(sessionData)
        );
        await this.redis.setex(
          `messages:${sessionId}`,
          this.sessionTTL,
          JSON.stringify([])
        );
      } else {
        // Fallback to in-memory storage
        this.fallbackStorage.set(`session:${sessionId}`, sessionData);
        this.fallbackStorage.set(`messages:${sessionId}`, []);
      }

      logger.info('Session created', { sessionId: sessionId.substring(0, 8) });
      return sessionData;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  // Get session information
  async getSessionInfo(sessionId) {
    try {
      let sessionData = null;

      if (this.redis) {
        const data = await this.redis.get(`session:${sessionId}`);
        sessionData = data ? JSON.parse(data) : null;
      } else {
        sessionData = this.fallbackStorage.get(`session:${sessionId}`) || null;
      }

      if (!sessionData) {
        // Create session if it doesn't exist
        return await this.createSession(sessionId);
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session info:', error);
      throw error;
    }
  }

  // Add message to session
  async addMessage(sessionId, message) {
    try {
      // Ensure session exists
      await this.getSessionInfo(sessionId);

      if (this.redis) {
        // Get existing messages
        const messagesData = await this.redis.get(`messages:${sessionId}`);
        const messages = messagesData ? JSON.parse(messagesData) : [];
        
        // Add new message
        messages.push(message);
        
        // Keep only last 100 messages to prevent memory issues
        if (messages.length > 100) {
          messages.splice(0, messages.length - 100);
        }
        
        // Save back to Redis
        await this.redis.setex(
          `messages:${sessionId}`,
          this.sessionTTL,
          JSON.stringify(messages)
        );

        // Update session info
        const sessionData = await this.getSessionInfo(sessionId);
        sessionData.lastActivity = new Date().toISOString();
        sessionData.messageCount = messages.length;
        
        await this.redis.setex(
          `session:${sessionId}`,
          this.sessionTTL,
          JSON.stringify(sessionData)
        );
      } else {
        // Fallback to in-memory storage
        const messages = this.fallbackStorage.get(`messages:${sessionId}`) || [];
        messages.push(message);
        
        if (messages.length > 100) {
          messages.splice(0, messages.length - 100);
        }
        
        this.fallbackStorage.set(`messages:${sessionId}`, messages);
        
        const sessionData = this.fallbackStorage.get(`session:${sessionId}`);
        if (sessionData) {
          sessionData.lastActivity = new Date().toISOString();
          sessionData.messageCount = messages.length;
          this.fallbackStorage.set(`session:${sessionId}`, sessionData);
        }
      }

      logger.debug('Message added to session', {
        sessionId: sessionId.substring(0, 8),
        messageId: message.id,
        role: message.role,
      });
    } catch (error) {
      logger.error('Failed to add message to session:', error);
      throw error;
    }
  }

  // Get messages from session
  async getMessages(sessionId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;

      let messages = [];

      if (this.redis) {
        const messagesData = await this.redis.get(`messages:${sessionId}`);
        messages = messagesData ? JSON.parse(messagesData) : [];
      } else {
        messages = this.fallbackStorage.get(`messages:${sessionId}`) || [];
      }

      // Apply pagination
      const startIndex = Math.max(0, messages.length - limit - offset);
      const endIndex = Math.max(0, messages.length - offset);
      
      return messages.slice(startIndex, endIndex);
    } catch (error) {
      logger.error('Failed to get messages:', error);
      throw error;
    }
  }

  // Delete session
  async deleteSession(sessionId) {
    try {
      if (this.redis) {
        await this.redis.del(`session:${sessionId}`);
        await this.redis.del(`messages:${sessionId}`);
      } else {
        this.fallbackStorage.delete(`session:${sessionId}`);
        this.fallbackStorage.delete(`messages:${sessionId}`);
      }

      logger.info('Session deleted', { sessionId: sessionId.substring(0, 8) });
    } catch (error) {
      logger.error('Failed to delete session:', error);
      throw error;
    }
  }

  // Clean up expired sessions (for in-memory fallback)
  startCleanupTimer() {
    if (!this.redis) {
      setInterval(() => {
        const now = Date.now();
        const expiredSessions = [];

        for (const [key, value] of this.fallbackStorage.entries()) {
          if (key.startsWith('session:') && value.created) {
            const sessionAge = now - new Date(value.created).getTime();
            if (sessionAge > this.sessionTTL * 1000) {
              expiredSessions.push(key);
            }
          }
        }

        expiredSessions.forEach(sessionKey => {
          const sessionId = sessionKey.replace('session:', '');
          this.fallbackStorage.delete(sessionKey);
          this.fallbackStorage.delete(`messages:${sessionId}`);
        });

        if (expiredSessions.length > 0) {
          logger.info(`Cleaned up ${expiredSessions.length} expired sessions`);
        }
      }, 60000); // Check every minute
    }
  }
}