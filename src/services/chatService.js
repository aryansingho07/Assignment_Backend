import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "../utils/logger.js";
import { EmbeddingsService } from "./embeddings.js";
import { VectorStoreService } from "./vectorStore.js";

export class ChatService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.embeddingsService = new EmbeddingsService();
    this.vectorStore = new VectorStoreService();
    this.initialize();
  }

  initialize() {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.warn("GEMINI_API_KEY not found, using mock responses");
        return;
      }

      this.genAI = new GoogleGenerativeAI(apiKey);
      const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
      this.model = this.genAI.getGenerativeModel({ model: modelName });
      logger.info("Gemini AI initialized successfully", { model: modelName });
    } catch (error) {
      logger.error("Failed to initialize Gemini AI:", error);
    }
  }

  // Generate a complete response with RAG
  async generateResponse(sessionId, message) {
    try {
      if (!this.model) {
        return this.getMockResponse(message);
      }

      // Get relevant context using RAG
      const context = await this.getRelevantContext(message);
      const prompt = this.buildPrompt(message, context);

      logger.info("Generating AI response with RAG", {
        sessionId: sessionId.substring(0, 8),
        promptLength: prompt.length,
        contextSources: context.length,
      });

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      return {
        content,
        sources: context.map((ctx) => ({
          title: ctx.metadata.title,
          url: ctx.metadata.url,
          source: ctx.metadata.source,
          publishedAt: ctx.metadata.publishedAt,
          snippet: ctx.content.substring(0, 200) + "...",
          score: ctx.score,
        })),
        usage: {
          promptTokens: 0, // Gemini doesn't provide token counts in free tier
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } catch (error) {
      logger.error("Failed to generate AI response:", error);
      return this.getMockResponse(message);
    }
  }

  // Generate streaming response with RAG
  async generateStreamingResponse(sessionId, message, onChunk) {
    try {
      if (!this.model) {
        return this.getMockStreamingResponse(message, onChunk);
      }

      // Get relevant context using RAG
      const context = await this.getRelevantContext(message);
      const prompt = this.buildPrompt(message, context);

      logger.info("Generating streaming AI response with RAG", {
        sessionId: sessionId.substring(0, 8),
        promptLength: prompt.length,
        contextSources: context.length,
      });

      const result = await this.model.generateContentStream(prompt);

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          onChunk(chunkText);
        }
      }
    } catch (error) {
      logger.error("Failed to generate streaming AI response:", error);
      return this.getMockStreamingResponse(message, onChunk);
    }
  }

  // Get relevant context using RAG
  async getRelevantContext(message) {
    try {
      // Generate embedding for the user's message
      const messageEmbedding =
        await this.embeddingsService.generateSingleEmbedding(message);

      if (!messageEmbedding || !messageEmbedding.embedding) {
        logger.warn(
          "Failed to generate embedding for message, proceeding without context",
        );
        return [];
      }

      // Search for similar content in vector store
      const similarContent = await this.vectorStore.searchSimilar(
        messageEmbedding.embedding,
        5, // Get top 5 most relevant articles
        0.3, // Lower similarity threshold for better recall
      );

      logger.info(
        `Found ${similarContent.length} relevant articles for context`,
      );
      return similarContent;
    } catch (error) {
      logger.error("Failed to get relevant context:", error);
      return [];
    }
  }

  // Build prompt for the AI model with RAG context
  buildPrompt(message, context = []) {
    let systemPrompt = `You are a helpful AI assistant specialized in news and current events. You provide informative, accurate, and engaging responses based on the latest news information.

Key guidelines:
- Use the provided news context to give accurate, up-to-date information
- Cite specific sources when referencing the provided articles
- If the context doesn't contain relevant information, acknowledge this
- Provide factual, well-structured responses with markdown formatting
- Be conversational but professional
- Focus on being helpful and informative`;

    if (context.length > 0) {
      systemPrompt += `\n\nRELEVANT NEWS CONTEXT:\n`;
      context.forEach((ctx, index) => {
        systemPrompt += `\n[Source ${index + 1}: ${ctx.metadata.source} - ${
          ctx.metadata.title
        }]
Published: ${new Date(ctx.metadata.publishedAt).toLocaleDateString()}
Content: ${ctx.content.substring(0, 800)}...
URL: ${ctx.metadata.url}\n`;
      });
    }

    systemPrompt += `\n\nUser question: ${message}

Please provide a comprehensive response using the news context above when relevant:`;

    return systemPrompt;
  }

  // Mock response for when AI is not available
  getMockResponse(message) {
    const responses = [
      {
        content: `I received your message: "${message}"\n\n**This is a demo response** since the AI service is not fully configured yet.\n\n### Features Available:\n- ✅ Real-time chat interface\n- ✅ Session management\n- ✅ Message history\n- ✅ Streaming responses\n- ⏳ AI integration (in progress)\n- ⏳ RAG news search (planned)\n\n*To enable full AI responses, configure the GEMINI_API_KEY environment variable.*`,
        sources: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
      {
        content: `Thank you for your question about: "${message}"\n\n**Demo Mode Active** 🤖\n\nThis chatbot is designed to provide news-related information using RAG (Retrieval-Augmented Generation). Here's what it will do once fully configured:\n\n### Planned Features:\n1. **News Search**: Find relevant articles from multiple sources\n2. **Context Analysis**: Understand your questions in context\n3. **Source Citations**: Provide links to original articles\n4. **Real-time Updates**: Access to latest news information\n\n### Current Status:\n- Backend API: ✅ Running\n- Chat Interface: ✅ Working\n- AI Integration: ⚙️ Needs API key\n- Vector Database: ⚙️ Needs setup\n\n*Configure your environment variables to enable full functionality.*`,
        sources: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      },
    ];

    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Mock streaming response
  async getMockStreamingResponse(message, onChunk) {
    const fullResponse = `I understand you're asking about: "${message}"\n\nThis is a **streaming demo response** to show how the real-time chat interface works.\n\n### How Streaming Works:\n- Messages are sent in real-time chunks\n- You see the response being "typed" out\n- Provides better user experience\n- Reduces perceived latency\n\n### Next Steps:\n1. Configure GEMINI_API_KEY for AI responses\n2. Set up vector database for RAG functionality\n3. Add news ingestion pipeline\n4. Enable source citations\n\n*This demo shows the interface is working perfectly! 🎉*`;

    const words = fullResponse.split(" ");
    let currentText = "";

    for (let i = 0; i < words.length; i++) {
      currentText += (i > 0 ? " " : "") + words[i];
      onChunk(words[i] + (i < words.length - 1 ? " " : ""));

      // Simulate typing delay
      await new Promise((resolve) =>
        setTimeout(resolve, 50 + Math.random() * 100),
      );
    }
  }

  // Health check for the service
  async healthCheck() {
    try {
      if (!this.model) {
        return {
          status: "degraded",
          message: "AI model not initialized - missing API key",
        };
      }

      // Test with a simple prompt
      const result = await this.model.generateContent("Hello");
      const response = await result.response;

      return {
        status: "healthy",
        message: "AI service is working correctly",
        testResponse: response.text().substring(0, 50) + "...",
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: "AI service error",
        error: error.message,
      };
    }
  }
}
