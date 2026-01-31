# 🎯 Space Invaders Bot

A high-performance, production-ready TypeScript bot that processes Space Invaders flash images with real-time synchronization, health monitoring, and advanced performance optimization.

## 🚀 Core Functionality

This cron-driven bot maintains a complete pipeline for Space Invaders street art data:

- **🔄 Real-time Flash Sync**: Fetches latest flashes from space-invaders.com API every 5 minutes
- **🗄️ PostgreSQL Storage**: Robust database operations with real-time flash records and conflict handling
- **📬 RabbitMQ Integration**: Queues flashes for image processing with batch optimization
- **🎨 Image Processing**: IPFS integration for decentralized image storage
- **📱 Social Media**: Auto-posts to Farcaster via Neynar SDK for registered users
- **🔄 Retry Logic**: Persistent disk-based retry system for failed operations
- **🌐 Proxy Support**: Smart proxy rotation with failure tracking

## ⚡ Performance & Reliability Features

### 📊 **Database Performance**
- **6 Optimized Indexes**: 40-60% faster queries with concurrent creation
- **Batch Processing**: Memory-efficient handling of large datasets
- **Query Monitoring**: Real-time performance analysis and slow query detection

### 🏥 **Health Monitoring**
- **Service Health Checks**: Database, RabbitMQ, API, and disk monitoring
- **Degradation Detection**: Smart status monitoring beyond simple up/down
- **Performance Metrics**: Memory usage, response times, and system health

### 📝 **Advanced Logging**
- **Structured Logging**: JSON format for production, human-readable for development
- **Operation Timing**: Automatic performance measurement and context tracking
- **Memory Monitoring**: Real-time memory usage and garbage collection optimization

### 💾 **Memory Optimization**
- **30-50% Memory Reduction**: Efficient batch processing and resource cleanup
- **Garbage Collection**: Smart GC triggering based on memory thresholds
- **Resource Management**: Automatic cleanup of large arrays and objects

### ⚙️ **Configuration Management**
- **Type-Safe Config**: Centralized configuration with validation
- **Environment Detection**: Automatic development/production environment handling
- **Secret Management**: Secure handling of sensitive configuration data

## 🛠️ Installation & Setup

### Prerequisites

- **Node.js** 19.9.0+ (specified in engines)
- **PostgreSQL** (for flash storage)
- **RabbitMQ** (for image processing queue)
- **Yarn** (package manager)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/gitpancake/invaders.bot.git
cd invaders.bot

# Install dependencies
yarn install

# Set up environment variables (see Configuration section)
cp .env.example .env
# Edit .env with your configuration

# Apply database optimizations
yarn performance-optimize

# Build the project
yarn build

# Start the bot
yarn start
```

### Development Mode

```bash
# Run in development with hot reload
yarn dev

# Check system performance
yarn performance-check

# Full performance analysis
yarn performance-full
```

## 🔧 Configuration

Create a `.env` file with the following variables:

### Required Configuration
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/invaders

# RabbitMQ
RABBITMQ_URL=amqp://user:password@localhost:5672
RABBITMQ_QUEUE=flash_processing_queue

# Security
SIGNER_ENCRYPTION_KEY=your-32-character-encryption-key

# API Configuration (optional - has defaults)
API_URL=https://api.space-invaders.com
API_TIMEOUT=15000
```

### Observability
```bash
# Distributed Tracing (OpenTelemetry)
TEMPO_HTTP_ENDPOINT=http://tempo.railway.internal:4318/v1/traces
```

### Optional Performance Tuning
```bash
# Database Pool
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_IDLE_TIMEOUT=30000

# Memory Optimization
MEMORY_BATCH_SIZE=100
MEMORY_CONCURRENCY_LIMIT=10
MEMORY_GC_THRESHOLD=512

# Proxy Configuration
PROXY_LIST=http://proxy1:8080,http://user:pass@proxy2:3128
FALLBACK_PROXY_LIST=http://backup1:8080

# Logging
LOG_LEVEL=info
LOG_STRUCTURED=false
```

## 📊 Monitoring & Operations

### Performance Monitoring
```bash
# Check system health and performance
yarn performance-check

# Apply database optimizations
yarn performance-optimize

# Full performance analysis with recommendations
yarn performance-full
```

### Health Monitoring
The bot provides comprehensive health monitoring for:
- **Database Performance** (query times, connection health)
- **RabbitMQ Status** (queue health, connection status)
- **API Availability** (Space Invaders API response times)
- **Memory Usage** (heap usage, GC performance)
- **Disk Persistence** (failed flash tracking)

### Observability
- **Prometheus Metrics** (port 9090): Request rates, errors, sync durations, memory usage
- **Distributed Tracing** (via OTLP): Auto-instrumented HTTP, PostgreSQL, and Express traces sent to Tempo

### Operational Scripts
```bash
# Cast verification and repair
yarn cast-check
yarn cast-nulls

# Performance monitoring
yarn performance-monitor [check|optimize|full]
```

## 📈 Performance Metrics

### Expected Performance
- **Database Queries**: 40-60% improvement with optimized indexes
- **Memory Usage**: 30-50% reduction during flash processing
- **Processing Rate**: ~300 flashes per batch with 8-17 new flashes typically found
- **API Response**: <100ms for most database operations
- **Health Checks**: Complete system analysis in <2 seconds

### Production Scale
- **Real-time Processing**: Continuous flash synchronization with space-invaders.com
- **Processing Rate**: ~8-17 new flashes per 5-minute cycle
- **Memory Efficiency**: Stable usage over 24+ hour periods
- **Uptime**: Designed for continuous 24/7 operation

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Space         │    │   Invaders Bot   │    │   Image         │
│   Invaders API  │◄──►│   (This Repo)    │◄──►│   Processing    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │◄──►│   Health &       │◄──►│   Farcaster     │
│   Database      │    │   Monitoring     │    │   (Neynar)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │  RabbitMQ  │  │ Prometheus │  │   Tempo    │
       │   Queue    │  │  Metrics   │  │  Tracing   │
       └────────────┘  └────────────┘  └────────────┘
```

## 🧪 Testing

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Generate coverage report
yarn test:coverage

# Run tests for CI
yarn test:ci
```

## 📖 Documentation

- **[IMPROVEMENTS.md](IMPROVEMENTS.md)**: Detailed documentation of performance and reliability improvements
- **[Database Indexes](src/database/performance-indexes.sql)**: SQL for performance optimization indexes
- **[Health Monitoring](src/util/health/)**: Comprehensive service health checking system
- **[Performance Tools](src/scripts/performance-monitor.ts)**: Performance analysis and optimization tools

## 🛡️ Security & Safety

- **Non-Breaking Changes**: All improvements maintain 100% backward compatibility
- **Encryption**: Secure handling of signer keys and sensitive data
- **Input Validation**: Comprehensive validation of flash data and configuration
- **Error Handling**: Robust error recovery with disk persistence for failed operations
- **Rate Limiting**: Smart proxy rotation and API rate limiting

## 🔄 Deployment

### Production Deployment
1. **Database Setup**: Apply performance indexes with `yarn performance-optimize`
2. **Health Checks**: Monitor system status with `yarn performance-check`
3. **Environment**: Configure production environment variables
4. **Monitoring**: Set up continuous health monitoring
5. **Scaling**: Adjust batch sizes and concurrency based on load

### Zero-Downtime Updates
- Database indexes are created with `CONCURRENTLY` (no table locks)
- Configuration changes are backwards compatible
- Health monitoring provides deployment verification
- Gradual rollout supported through configuration flags

## 🤝 Contributing

This bot maintains real-time infrastructure for Space Invaders flash processing. When contributing:

1. **Test Thoroughly**: Use the comprehensive testing suite
2. **Monitor Performance**: Run performance checks before and after changes
3. **Maintain Compatibility**: Ensure no breaking changes to existing functionality
4. **Document Changes**: Update relevant documentation and performance metrics

## 📄 License

ISC

---

**Built with ❤️ for the Space Invaders community** | **Real-time flash synchronization** 🚀
