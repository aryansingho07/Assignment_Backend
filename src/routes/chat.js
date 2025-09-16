import express from "express";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger.js";
import { ChatService } from "../services/chatService.js";
import { SessionManager } from "../services/sessionManager.js";

const router = express.Router();
const sessionManager = new SessionManager();

// Regular chat endpoint
router.post("/", async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        error: "Missing required fields: sessionId and message",
      });
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({
        error: "Message must be a non-empty string",
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Message too long. Maximum 4000 characters allowed.",
      });
    }

    logger.info("Processing chat message", {
      sessionId: sessionId.substring(0, 8),
      messageLength: message.length,
    });

    // Add user message to session
    const userMessage = {
      id: uuidv4(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };

    await sessionManager.addMessage(sessionId, userMessage);

    // Generate AI response (new instance to ensure fresh model/env)
    const chatService = new ChatService();
    const aiResponse = await chatService.generateResponse(sessionId, message);

    // Add AI message to session
    const assistantMessage = {
      id: uuidv4(),
      role: "assistant",
      content: aiResponse.content,
      timestamp: new Date().toISOString(),
      sources: aiResponse.sources || [],
    };

    await sessionManager.addMessage(sessionId, assistantMessage);

    res.json({
      message: assistantMessage,
      sessionId,
    });
  } catch (error) {
    logger.error("Chat endpoint error:", {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: "Failed to process message",
      details:
        process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
});

// Streaming chat endpoint
router.get("/stream", async (req, res) => {
  try {
    const { sessionId, message } = req.query;

    if (!sessionId || !message) {
      return res.status(400).json({
        error: "Missing required query parameters: sessionId and message",
      });
    }

    logger.info("Starting streaming chat", {
      sessionId: sessionId.substring(0, 8),
      messageLength: message.length,
    });

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    });

    // Send initial status
    res.write(`event: status\n`);
    res.write(
      `data: ${JSON.stringify({
        status: "processing",
        message: "Processing your message...",
      })}\n\n`,
    );

    // Add user message to session
    const userMessage = {
      id: uuidv4(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };

    await sessionManager.addMessage(sessionId, userMessage);

    const messageId = uuidv4();
    let fullContent = "";

    // Stream response (new instance per request)
    const chatService = new ChatService();
    await chatService.generateStreamingResponse(sessionId, message, (chunk) => {
      fullContent += chunk;
      res.write(`event: chunk\n`);
      res.write(
        `data: ${JSON.stringify({
          messageId,
          content: fullContent,
          isChunk: true,
        })}\n\n`,
      );
    });

    // Add final message to session
    const assistantMessage = {
      id: messageId,
      role: "assistant",
      content: fullContent,
      timestamp: new Date().toISOString(),
    };

    await sessionManager.addMessage(sessionId, assistantMessage);

    // Send completion event
    res.write(`event: complete\n`);
    res.write(
      `data: ${JSON.stringify({
        messageId,
        content: fullContent,
        done: true,
      })}\n\n`,
    );

    res.end();
  } catch (error) {
    logger.error("Streaming chat error:", {
      error: error.message,
      stack: error.stack,
    });

    res.write(`event: error\n`);
    res.write(
      `data: ${JSON.stringify({
        error: "Failed to process streaming message",
        details:
          process.env.NODE_ENV !== "production" ? error.message : undefined,
      })}\n\n`,
    );

    res.end();
  }
});

// Get chat history
router.get("/history/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await sessionManager.getMessages(sessionId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      messages,
      sessionId,
      total: messages.length,
    });
  } catch (error) {
    logger.error("Get history error:", error);
    res.status(500).json({
      error: "Failed to retrieve chat history",
    });
  }
});

export default router;
