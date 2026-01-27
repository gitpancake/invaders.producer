-- Performance indexes for Space Invaders bot
-- These are NON-BLOCKING concurrent indexes that will improve query performance

-- Index for timestamp-based queries (most common pattern in your bot)
-- Improves: getSince(), getSinceByPlayers() performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flashes_timestamp 
ON flashes(timestamp);

-- Composite index for player + timestamp queries (used in flash sync)
-- Improves: getSinceByPlayers() performance significantly
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flashes_player_timestamp 
ON flashes(player, timestamp);

-- Index for flash_id lookups (used for deduplication)
-- Improves: getByIds() performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flashes_flash_id 
ON flashes(flash_id);

-- Partial index for flashes missing IPFS CID (used to find flashes needing image processing)
-- Improves queries filtering for missing ipfs_cid
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flashes_missing_ipfs 
ON flashes(timestamp) 
WHERE ipfs_cid IS NULL OR ipfs_cid = '';

-- Index for city-based queries (if needed for analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flashes_city 
ON flashes(city);

-- Composite index for player (lowercase) + city for flashcastr filtering
-- Improves filtering performance for with_paris vs without_paris
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flashes_player_lower_city 
ON flashes(LOWER(player), city);

-- Add comments for maintenance
COMMENT ON INDEX idx_flashes_timestamp IS 'Optimizes timestamp-based flash queries';
COMMENT ON INDEX idx_flashes_player_timestamp IS 'Optimizes user-specific flash history queries';
COMMENT ON INDEX idx_flashes_flash_id IS 'Optimizes flash ID lookups for deduplication';
COMMENT ON INDEX idx_flashes_missing_ipfs IS 'Optimizes queries for flashes awaiting image processing';
COMMENT ON INDEX idx_flashes_city IS 'Optimizes city-based flash queries';
COMMENT ON INDEX idx_flashes_player_lower_city IS 'Optimizes flashcastr user filtering queries';