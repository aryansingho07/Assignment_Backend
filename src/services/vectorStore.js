import { QdrantClient } from "@qdrant/js-client-rest";
import logger from "../utils/logger.js";

export class VectorStoreService {
  constructor() {
    this.client = null;
    this.collectionName = "news_articles";
    this.vectorSize = 768; // Jina embeddings dimension
    this.initialize();
  }

  async initialize() {
    try {
      const qdrantUrl = process.env.QDRANT_URL;
      const qdrantApiKey = process.env.QDRANT_API_KEY;

      if (!qdrantUrl) {
        logger.warn("QDRANT_URL not found, vector store will not be available");
        return;
      }

      this.client = new QdrantClient({
        url: qdrantUrl,
        apiKey: qdrantApiKey,
      });

      // Test connection
      await this.client.getCollections();
      logger.info("Qdrant client initialized successfully");

      // Ensure collection exists
      await this.ensureCollection();
    } catch (error) {
      logger.error("Failed to initialize Qdrant client:", error);
      this.client = null;
    }
  }

  async ensureCollection() {
    if (!this.client) return;

    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        (col) => col.name === this.collectionName,
      );

      if (!collectionExists) {
        logger.info(`Creating collection: ${this.collectionName}`);
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: "Cosine",
          },
        });
        logger.info(`Collection ${this.collectionName} created successfully`);
      } else {
        logger.info(`Collection ${this.collectionName} already exists`);
      }
    } catch (error) {
      logger.error("Failed to ensure collection exists:", error);
      throw error;
    }
  }

  async upsertVectors(vectors) {
    if (!this.client) {
      logger.warn("Qdrant client not initialized, skipping vector upsert");
      return false;
    }

    try {
      const points = vectors.map((vector, index) => ({
        id: this.generateValidPointId(vector.id || `point_${index}`),
        vector: vector.embedding,
        payload: {
          content: vector.content,
          ...vector.metadata,
        },
      }));

      // Upsert in batches to avoid memory issues
      const batchSize = 100;
      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);

        await this.client.upsert(this.collectionName, {
          wait: true,
          points: batch,
        });

        logger.info(
          `Upserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            points.length / batchSize,
          )} (${batch.length} vectors)`,
        );
      }

      logger.info(
        `Successfully upserted ${points.length} vectors to ${this.collectionName}`,
      );
      return true;
    } catch (error) {
      logger.error("Failed to upsert vectors:", error);
      return false;
    }
  }

  async searchSimilar(queryVector, limit = 5, threshold = 0.7) {
    if (!this.client) {
      logger.warn("Qdrant client not initialized, returning empty results");
      return [];
    }

    try {
      const searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit,
        score_threshold: threshold,
        with_payload: true,
      });

      const results = searchResult.map((result) => ({
        id: result.id,
        score: result.score,
        content: result.payload.content,
        metadata: {
          title: result.payload.title,
          url: result.payload.url,
          source: result.payload.source,
          publishedAt: result.payload.publishedAt,
          author: result.payload.author,
          description: result.payload.description,
          image: result.payload.image,
        },
      }));

      logger.info(
        `Found ${results.length} similar vectors with scores above ${threshold}`,
      );
      return results;
    } catch (error) {
      logger.error("Failed to search similar vectors:", error);
      return [];
    }
  }

  // Generate a valid point ID for Qdrant (UUID or integer)
  generateValidPointId(originalId) {
    // Create a simple hash from the original ID and convert to integer
    let hash = 0;
    for (let i = 0; i < originalId.length; i++) {
      const char = originalId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure it's positive
    return Math.abs(hash);
  }

  async getCollectionInfo() {
    if (!this.client) {
      return null;
    }

    try {
      const info = await this.client.getCollection(this.collectionName);
      return {
        name: this.collectionName,
        vectorsCount: info.vectors_count,
        indexedVectorsCount: info.indexed_vectors_count,
        pointsCount: info.points_count,
        status: info.status,
      };
    } catch (error) {
      logger.error("Failed to get collection info:", error);
      return null;
    }
  }

  async deleteCollection() {
    if (!this.client) {
      logger.warn("Qdrant client not initialized");
      return false;
    }

    try {
      await this.client.deleteCollection(this.collectionName);
      logger.info(`Collection ${this.collectionName} deleted successfully`);
      return true;
    } catch (error) {
      logger.error("Failed to delete collection:", error);
      return false;
    }
  }

  async clearCollection() {
    if (!this.client) {
      logger.warn("Qdrant client not initialized");
      return false;
    }

    try {
      // Delete all points in the collection
      await this.client.delete(this.collectionName, {
        filter: {
          must: [
            {
              key: "source",
              match: {
                any: [
                  "BBC News",
                  "CNN",
                  "Reuters",
                  "The Guardian",
                  "NewsAPI",
                  "RSS Feed",
                ],
              },
            },
          ],
        },
      });

      logger.info(`Collection ${this.collectionName} cleared successfully`);
      return true;
    } catch (error) {
      logger.error("Failed to clear collection:", error);
      return false;
    }
  }

  // Health check for the vector store service
  async healthCheck() {
    try {
      if (!this.client) {
        return {
          status: "degraded",
          message: "Qdrant client not initialized - missing URL or API key",
        };
      }

      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        (col) => col.name === this.collectionName,
      );

      if (!collectionExists) {
        return {
          status: "degraded",
          message: `Collection ${this.collectionName} does not exist`,
        };
      }

      const info = await this.getCollectionInfo();

      return {
        status: "healthy",
        message: "Qdrant vector store is working correctly",
        collectionInfo: info,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: "Vector store service error",
        error: error.message,
      };
    }
  }
}
