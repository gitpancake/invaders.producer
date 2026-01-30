# CLAUDE.md - Project Guide for Claude Code

## Project Overview

**invaders.bot** is a high-performance TypeScript bot that processes Space Invaders street art flash data with real-time synchronization. It syncs data from the space-invaders.com API, stores it in PostgreSQL, queues images for IPFS processing via RabbitMQ, and auto-publishes casts to Farcaster for registered Flashcastr users.

## Tech Stack

- **Runtime**: Node.js >= 19.9.0
- **Language**: TypeScript 5.7.2
- **Database**: PostgreSQL
- **Message Queue**: RabbitMQ
- **Social Integration**: Neynar SDK (Farcaster)
- **Package Manager**: Yarn 1.22.22

## Project Structure

```
src/
├── index.ts                           # Entry point, boots CombinedSyncCron
├── scripts/
│   ├── cast-check.ts                  # Cast verification and repair
│   ├── cast-nulls.ts                  # Null cast handling
│   └── performance-monitor.ts         # Health checks and optimization
└── util/
    ├── config/index.ts                # Centralized configuration with validation
    ├── cron-jobs/
    │   ├── base.ts                    # Abstract cron job base class
    │   ├── combined-sync.ts           # Main orchestrator (runs every 5 min)
    │   ├── store-flashes.ts           # Fetches & stores flashes from API
    │   ├── flash-sync.ts              # Syncs flashes to Farcaster users
    │   └── force-sync.ts              # Manual sync trigger
    ├── database/
    │   ├── postgres.ts                # Abstract base class for DB operations
    │   ├── postgresClient.ts          # PostgreSQL connection pool
    │   ├── performance.ts             # Performance optimization utilities
    │   ├── invader-flashes/           # Flash data operations
    │   ├── flashcastr-flashes/        # Flashcastr flash tracking
    │   └── flashcastr-users/          # Flashcastr user management
    ├── disk-persistence/index.ts      # Failed operation persistence for retry
    ├── encrypt.ts                     # Encryption for signer keys
    ├── flash-invaders/index.ts        # Space Invaders API client (proxy rotation)
    ├── health/index.ts                # Health monitoring for all services
    ├── logger/index.ts                # Structured logging (JSON in prod)
    ├── memory/optimizer.ts            # Memory-efficient batch processing
    ├── neynar/                        # Farcaster/Neynar integration
    ├── rabbitmq/index.ts              # Message queue publishing
    └── times.ts                       # Time formatting utilities
```

## Common Commands

```bash
# Development
yarn dev                    # Run with nodemon + ts-node
yarn start:dev              # Alias for dev

# Build & Run
yarn build                  # Compile TypeScript to dist/
yarn start                  # Run compiled JS from dist/

# Testing
yarn test                   # Run Jest tests
yarn test:watch             # Run tests in watch mode
yarn test:coverage          # Run tests with coverage

# Performance & Monitoring
yarn performance-check      # Quick health status
yarn performance-optimize   # Apply database indexes
yarn performance-full       # Full analysis with recommendations

# Utilities
yarn cast-check             # Verify and repair casts
yarn cast-nulls             # Handle null casts
```

## Deployment

Uses PM2 for process management:
```bash
make run                    # git pull, build, restart PM2, show logs
```

## Data Flow

```
Space Invaders API (with proxy rotation)
         ↓
    Validation & Deduplication
         ↓
    PostgreSQL (performance-indexed)
         ↓
    RabbitMQ Queue (flashes without IPFS)
         ↓
    Image Processing Service (external)
         ↓
    Flashcastr Users Check (auto_cast enabled?)
         ↓
    Neynar SDK → Farcaster
```

## Key Data Models

**Flash** (invader_flashes table):
- `flash_id`, `city`, `player`, `img`, `ipfs_cid`, `text`, `timestamp`, `flash_count`

**FlashcastrFlash** (flashcastr_flashes table):
- `flash_id`, `user_fid`, `user_username`, `user_pfp_url`, `cast_hash`

**FlashcastrUser**:
- `username`, `fid`, `signer_uuid` (encrypted), `auto_cast`

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `RABBITMQ_URL` - RabbitMQ connection string
- `RABBITMQ_QUEUE` - Queue name for image processing
- `SIGNER_ENCRYPTION_KEY` - Key for encrypting Neynar signers
- `NEYNAR_API_KEY` - Neynar API authentication

Optional:
- `NODE_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging verbosity
- `DB_POOL_MAX` - Max database connections
- `PROXY_LIST` - Comma-separated proxy URLs
- `FALLBACK_PROXY_LIST` - Backup proxies

## Architecture Notes

- **Cron Schedule**: Main sync runs every 5 minutes via `CombinedSyncCron`
- **Off-Peak Optimization**: 50% reduced frequency during European night (11 PM - 6 AM)
- **Retry Logic**: Failed operations persisted to disk, retried on next cycle
- **Proxy Rotation**: Smart rotation with failure tracking and anti-detection measures
- **Health Monitoring**: Checks database, RabbitMQ, API, and disk availability

## Code Conventions

- Strict TypeScript with `strict: true`
- CommonJS modules (target ES2016)
- Source maps enabled for debugging
- Husky for git hooks
- Structured JSON logging in production
