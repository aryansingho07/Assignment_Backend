# RAG Chatbot Backend

A comprehensive backend service for a RAG (Retrieval-Augmented Generation) powered chatbot system that ingests news articles, generates embeddings, and provides intelligent conversational AI responses.

## Features

- 🔍 **RAG Pipeline**: Retrieval-augmented generation using vector similarity search
- 📰 **News Ingestion**: Automated scraping from Reuters, BBC, CNN and other sources
- 🧠 **Jina AI Embeddings**: High-quality 768-dimensional text embeddings
- 🗄️ **Qdrant Vector Database**: Efficient similarity search and storage
- 💾 **Redis Session Management**: TTL-based chat history and caching
- 🤖 **Google Gemini Integration**: Advanced language model responses
- ⚡ **Streaming Support**: Real-time response generation with Server-Sent Events
- 🔒 **Security**: Rate limiting, input validation, and security headers
- 📊 **Monitoring**: Comprehensive logging and health checks

## Tech Stack

- **Node.js 18+** - Runtime environment
- **Express** - Web framework
- **Qdrant** - Vector database for embeddings
- **Redis** - Session management and caching
- **Jina AI** - Text embedding generation
- **Google Gemini** - Large language model
- **Winston** - Structured logging
- **Docker** - Containerization support

## Quick Start

### Prerequisites

1. Node.js 18+ and npm
2. Redis server (local or Docker)
3. Qdrant vector database (local or Docker)
4. API keys for Jina AI and Google Gemini

### Installation

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start dependencies with Docker:**
   ```bash
   # Start Redis
   docker run -d --name redis -p 6379:6379 redis:alpine

   # Start Qdrant
   docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
   ```

4. **Run data ingestion:**
   ```bash
   npm run ingest
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:5000`

## API Documentation

### Core Endpoints

#### Chat
```http
POST /api/chat
Content-Type: application/json

{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "What's the latest news about AI?"
}
```

#### Streaming Chat
```http
POST /api/chat/stream
Content-Type: application/json

{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000", 
  "message": "Tell me about recent technology developments"
}
```

#### Session Management
```http
# Create new session
POST /api/session

# Get session info  
GET /api/session/{sessionId}

# Clear session
DELETE /api/session/{sessionId}
```

#### Chat History
```http
# Get chat history
GET /api/history/{sessionId}?limit=50&offset=0

# Search chat history
GET /api/history/{sessionId}/search?query=AI&role=user&limit=10

# Delete specific message
DELETE /api/history/{sessionId}/message/{messageId}
```

#### Health Checks
```http
GET /api/health              # Basic health check
GET /api/health/db           # Database connectivity 
GET /api/health/services     # All services health
```

### Response Format

#### Chat Response
```json
{
  "messageId": "123e4567-e89b-12d3-a456-426614174000",
  "content": "Based on recent articles, AI development has accelerated...",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00Z",
  "sources": [
    {
      "id": 1,
      "title": "Major AI Breakthrough Announced",
      "source": "reuters",
      "url": "https://reuters.com/article/...",
      "publishedDate": "2024-01-15T09:00:00Z",
      "relevanceScore": 0.892
    }
  ],
  "usage": {
    "promptTokens": 1250,
    "completionTokens": 456,
    "totalTokens": 1706
  },
  "contextUsed": 3
}
```

#### Streaming Response Events
```javascript
// SSE Events
event: status
data: {"status": "processing", "message": "Processing your message..."}

event: chunk  
data: {"messageId": "...", "content": "Based on", "isChunk": true}

event: complete
data: {"messageId": "...", "content": "Full response", "sources": [...]}
```

## Configuration

### Environment Variables

Key configuration options in `.env`:

```env
# Required API Keys
JINA_API_KEY=your_jina_api_key
GEMINI_API_KEY=your_gemini_api_key

# Database URLs  
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333

# RAG Settings
MAX_RETRIEVAL_RESULTS=5
SIMILARITY_THRESHOLD=0.7
CHUNK_SIZE=1000

# Cache TTL (seconds)
CHAT_HISTORY_TTL=86400      # 24 hours
VECTOR_CACHE_TTL=2592000    # 30 days
```

### Caching Strategy

The system implements multi-level caching:

- **Session Cache**: Redis-based chat history with TTL expiration
- **Vector Cache**: Persistent embeddings in Qdrant  
- **Application Cache**: In-memory caching for frequent operations

#### Cache Warming

```bash
# Pre-populate cache with common queries
npm run cache:warm

# Background refresh of expiring entries  
npm run cache:refresh
```

### TTL Configuration

Configure cache expiration times:

```env
CHAT_HISTORY_TTL=86400    # Chat sessions: 24 hours
REDIS_TTL=3600           # General cache: 1 hour  
VECTOR_CACHE_TTL=2592000 # Embeddings: 30 days
```

## Data Ingestion

### Automated Ingestion

The ingestion script scrapes news articles and generates embeddings:

```bash
# Run full ingestion pipeline
npm run ingest

# Ingest from specific sources
NEWS_SOURCES=reuters,bbc npm run ingest

# Limit article count
MAX_ARTICLES=25 npm run ingest
```

### Ingestion Process

1. **Article Scraping**: Fetches articles from RSS feeds and web pages
2. **Content Processing**: Cleans HTML, extracts text, splits into chunks
3. **Embedding Generation**: Creates 768-dim vectors using Jina AI
4. **Vector Storage**: Stores embeddings with metadata in Qdrant

### Supported Sources

- **Reuters**: RSS feed + article scraping
- **BBC**: Homepage and section page scraping  
- **CNN**: Homepage and category scraping
- **Custom**: Extensible to add more sources

## Development

### Project Structure

```
src/
├── app.js              # Express application setup
├── config/             # Configuration management
│   ├── env.js         # Environment variables
│   └── database.js    # Database connections
├── services/           # Business logic
│   ├── ingestion.js   # News article scraping
│   ├── embeddings.js  # Jina AI integration
│   ├── vectorStore.js # Qdrant operations
│   ├── llm.js         # Gemini API integration
│   └── sessionManager.js # Redis session management
├── controllers/        # API route handlers
│   └── chatController.js
├── routes/            # Route definitions
│   └── index.js
├── middleware/        # Custom middleware
│   └── validation.js
├── utils/            # Helper functions
│   └── logger.js
└── scripts/          # Utility scripts
    └── ingest.js     # Data ingestion
```

### Scripts

```bash
npm run dev         # Development server with hot reload
npm run start       # Production server
npm run ingest      # Run data ingestion
npm run test        # Run tests (when implemented)
npm run lint        # Code linting
npm run lint:fix    # Auto-fix linting issues
```

### Adding New Features

1. **New Endpoints**: Add routes in `src/routes/`
2. **Business Logic**: Implement in `src/services/`
3. **Validation**: Add middleware in `src/middleware/`
4. **Configuration**: Update `src/config/env.js`

## Deployment

### Production Setup

1. **Environment Configuration:**
   ```bash
   NODE_ENV=production
   LOG_LEVEL=warn
   ENABLE_DEBUG_LOGS=false
   ```

2. **Process Management:**
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start src/app.js --name rag-chatbot

   # Using systemd
   sudo systemctl enable rag-chatbot
   sudo systemctl start rag-chatbot
   ```

3. **Reverse Proxy (nginx):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location /api/ {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Docker Deployment

```bash
# Build image
docker build -t rag-chatbot-backend .

# Run with docker-compose  
docker-compose up -d
```

## Monitoring

### Health Checks

Monitor system health:

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/api/health/db
curl http://localhost:5000/api/health/services
```

### Logging

Structured logging with Winston:

- **Development**: Console output with colors
- **Production**: File rotation with JSON format
- **Log Levels**: error, warn, info, debug, verbose

### Performance Monitoring

Key metrics to monitor:

- Response time per endpoint
- Vector search performance  
- Cache hit rates
- API rate limiting
- Memory usage
- Database connections

## Troubleshooting

### Common Issues

1. **Vector Search Returns No Results**
   ```bash
   # Check collection status
   curl http://localhost:6333/collections/news_articles
   
   # Verify embeddings exist
   npm run ingest
   ```

2. **High Memory Usage**
   ```bash
   # Check Redis memory usage
   redis-cli info memory
   
   # Monitor Node.js heap
   node --max-old-space-size=4096 src/app.js
   ```

3. **API Rate Limits**
   ```env
   # Adjust rate limiting
   RATE_LIMIT_MAX_REQUESTS=200
   RATE_LIMIT_WINDOW_MS=900000
   ```

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
ENABLE_DEBUG_LOGS=true
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## License

MIT License - see LICENSE file for details