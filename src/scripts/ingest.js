#!/usr/bin/env node

import { IngestionService } from '../services/ingestion.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { VectorStoreService } from '../services/vectorStore.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runIngestion() {
  logger.info('🚀 Starting news ingestion pipeline...');
  
  const ingestionService = new IngestionService();
  const embeddingsService = new EmbeddingsService();
  const vectorStore = new VectorStoreService();
  
  try {
    // Step 1: Fetch latest news articles
    logger.info('📰 Fetching latest news articles...');
    const articles = await ingestionService.fetchLatestNews();
    
    if (articles.length === 0) {
      logger.warn('No articles were fetched. Please check your API keys or network connection.');
      process.exit(1);
    }
    
    logger.info(`✅ Successfully fetched ${articles.length} articles`);
    
    // Step 2: Process articles into chunks for embedding
    logger.info('🔄 Processing articles for embedding...');
    const chunks = await ingestionService.processArticlesForEmbedding(articles);
    
    logger.info(`✅ Created ${chunks.length} text chunks from ${articles.length} articles`);
    
    // Step 3: Generate embeddings for all chunks
    logger.info('🧮 Generating embeddings...');
    const texts = chunks.map(chunk => chunk.content);
    const embeddings = await embeddingsService.generateEmbeddings(texts);
    
    if (embeddings.length === 0) {
      logger.warn('No embeddings were generated. Please check your Jina API key.');
      process.exit(1);
    }
    
    logger.info(`✅ Generated ${embeddings.length} embeddings`);
    
    // Step 4: Combine chunks with embeddings
    const vectorData = chunks.map((chunk, index) => ({
      id: chunk.id,
      content: chunk.content,
      embedding: embeddings[index]?.embedding || [],
      metadata: chunk.metadata,
    })).filter(item => item.embedding.length > 0);
    
    logger.info(`✅ Prepared ${vectorData.length} vectors for storage`);
    
    // Step 5: Store vectors in Qdrant
    logger.info('💾 Storing vectors in Qdrant...');
    const success = await vectorStore.upsertVectors(vectorData);
    
    if (!success) {
      logger.error('Failed to store vectors in Qdrant. Please check your Qdrant configuration.');
      process.exit(1);
    }
    
    // Step 6: Verify storage
    const collectionInfo = await vectorStore.getCollectionInfo();
    if (collectionInfo) {
      logger.info('📊 Collection status:', collectionInfo);
    }
    
    logger.info('🎉 News ingestion pipeline completed successfully!');
    logger.info(`📈 Summary:
    - Articles fetched: ${articles.length}
    - Text chunks created: ${chunks.length}
    - Embeddings generated: ${embeddings.length}
    - Vectors stored: ${vectorData.length}
    `);
    
    // Show some sample articles
    logger.info('📋 Sample articles ingested:');
    articles.slice(0, 3).forEach((article, index) => {
      logger.info(`${index + 1}. ${article.title} (${article.source})`);
    });
    
  } catch (error) {
    logger.error('❌ Ingestion pipeline failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Ingestion interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Ingestion terminated');
  process.exit(0);
});

// Run the ingestion pipeline
runIngestion();
