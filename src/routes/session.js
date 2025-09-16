import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import { SessionManager } from '../services/sessionManager.js';

const router = express.Router();
const sessionManager = new SessionManager();

// Create new session
router.post('/', async (req, res) => {
  try {
    const sessionId = uuidv4();
    
    await sessionManager.createSession(sessionId);
    
    logger.info('New session created', { sessionId: sessionId.substring(0, 8) });
    
    res.json({
      sessionId,
      created: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Create session error:', error);
    res.status(500).json({
      error: 'Failed to create session',
    });
  }
});

// Get session info
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const sessionInfo = await sessionManager.getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      return res.status(404).json({
        error: 'Session not found',
      });
    }
    
    res.json(sessionInfo);
  } catch (error) {
    logger.error('Get session error:', error);
    res.status(500).json({
      error: 'Failed to retrieve session',
    });
  }
});

// Delete session
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    await sessionManager.deleteSession(sessionId);
    
    logger.info('Session deleted', { sessionId: sessionId.substring(0, 8) });
    
    res.json({
      message: 'Session deleted successfully',
      sessionId,
    });
  } catch (error) {
    logger.error('Delete session error:', error);
    res.status(500).json({
      error: 'Failed to delete session',
    });
  }
});

export default router;