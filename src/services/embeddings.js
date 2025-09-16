import axios from "axios";
import logger from "../utils/logger.js";

export class EmbeddingsService {
  constructor() {
    this.apiKey = process.env.JINA_API_KEY;
    this.baseURL = "https://api.jina.ai/v1/embeddings";
    this.model = "jina-embeddings-v2-base-en";
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.batchSize = 20; // Process in batches to avoid rate limits
  }

  async generateEmbeddings(texts) {
    if (!this.apiKey) {
      logger.warn("JINA_API_KEY not found, skipping embeddings generation");
      return [];
    }

    if (!Array.isArray(texts)) {
      texts = [texts];
    }

    const allEmbeddings = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      logger.info(
        `Processing embedding batch ${
          Math.floor(i / this.batchSize) + 1
        }/${Math.ceil(texts.length / this.batchSize)}`,
      );

      try {
        const batchEmbeddings = await this.generateBatchEmbeddings(batch);
        allEmbeddings.push(...batchEmbeddings);

        // Rate limiting delay between batches
        if (i + this.batchSize < texts.length) {
          await this.delay(500);
        }
      } catch (error) {
        logger.error(
          `Failed to generate embeddings for batch starting at index ${i}:`,
          error,
        );
        // Continue with next batch rather than failing completely
      }
    }

    logger.info(
      `Generated ${allEmbeddings.length} embeddings out of ${texts.length} texts`,
    );
    return allEmbeddings;
  }

  async generateBatchEmbeddings(texts, retryCount = 0) {
    try {
      const response = await axios.post(
        this.baseURL,
        {
          model: this.model,
          input: texts,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      if (response.data && response.data.data) {
        const embeddings = response.data.data.map((item) => ({
          embedding: item.embedding,
          index: item.index,
        }));

        // Validate embedding dimensions
        if (embeddings.length > 0) {
          const expectedDim = 768; // Jina embeddings dimension
          const actualDim = embeddings[0].embedding.length;

          if (actualDim !== expectedDim) {
            logger.warn(
              `Unexpected embedding dimension: ${actualDim}, expected: ${expectedDim}`,
            );
          }
        }

        return embeddings;
      } else {
        throw new Error("Invalid response format from Jina API");
      }
    } catch (error) {
      if (retryCount < this.maxRetries) {
        logger.warn(
          `Embedding generation failed, retrying (${retryCount + 1}/${
            this.maxRetries
          }):`,
          error.message,
        );
        await this.delay(this.retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this.generateBatchEmbeddings(texts, retryCount + 1);
      }

      logger.error("Failed to generate embeddings after all retries:", {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      // Return empty embeddings for failed batch to allow processing to continue
      return texts.map((_, index) => ({
        embedding: new Array(768).fill(0), // Zero vector as fallback
        index,
        failed: true,
      }));
    }
  }

  async generateSingleEmbedding(text) {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings.length > 0 ? embeddings[0] : null;
  }

  // Utility function for cosine similarity (useful for testing)
  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Health check for the embeddings service
  async healthCheck() {
    try {
      if (!this.apiKey) {
        return {
          status: "degraded",
          message: "Jina API key not configured",
        };
      }

      // Test with a simple text
      const testEmbedding = await this.generateSingleEmbedding("Hello world");

      if (
        testEmbedding &&
        testEmbedding.embedding &&
        testEmbedding.embedding.length === 768
      ) {
        return {
          status: "healthy",
          message: "Jina embeddings service is working correctly",
          embeddingDimension: testEmbedding.embedding.length,
        };
      } else {
        return {
          status: "unhealthy",
          message: "Embeddings service returned invalid response",
        };
      }
    } catch (error) {
      return {
        status: "unhealthy",
        message: "Embeddings service error",
        error: error.message,
      };
    }
  }
}
