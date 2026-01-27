import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

export class DatabasePerformance {
  constructor(private pool: Pool) {}

  /**
   * Apply performance indexes to the database
   * Uses CONCURRENTLY to avoid locking the table
   */
  async applyPerformanceIndexes(): Promise<void> {
    try {
      console.log('[DatabasePerformance] Applying performance indexes...');
      
      const indexesPath = path.join(__dirname, '..', '..', 'database', 'performance-indexes.sql');
      
      if (!fs.existsSync(indexesPath)) {
        throw new Error(`Indexes file not found at: ${indexesPath}`);
      }

      const indexesSQL = fs.readFileSync(indexesPath, 'utf-8');
      
      // Split by semicolon and execute each statement separately
      const statements = indexesSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('COMMENT'));

      for (const statement of statements) {
        try {
          console.log(`[DatabasePerformance] Executing: ${statement.substring(0, 80)}...`);
          await this.pool.query(statement);
          console.log(`[DatabasePerformance] ✓ Index applied successfully`);
        } catch (error) {
          // Log but don't throw - some indexes might already exist
          console.warn(`[DatabasePerformance] Warning: ${(error as Error).message}`);
        }
      }

      // Apply comments separately
      const commentStatements = indexesSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.startsWith('COMMENT'));

      for (const comment of commentStatements) {
        try {
          await this.pool.query(comment);
        } catch (error) {
          console.warn(`[DatabasePerformance] Comment warning: ${(error as Error).message}`);
        }
      }

      console.log('[DatabasePerformance] ✅ Performance indexes applied successfully');
    } catch (error) {
      console.error('[DatabasePerformance] ❌ Failed to apply performance indexes:', error);
      throw error;
    }
  }

  /**
   * Get index usage statistics
   */
  async getIndexStats(): Promise<any[]> {
    try {
      const query = `
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_blks_read,
          idx_blks_hit,
          CASE 
            WHEN (idx_blks_read + idx_blks_hit) > 0 
            THEN round((idx_blks_hit::float / (idx_blks_read + idx_blks_hit)::float * 100)::numeric, 2)
            ELSE 0 
          END as hit_ratio_percent
        FROM pg_stat_user_indexes
        WHERE tablename = 'flashes'
        ORDER BY idx_blks_read + idx_blks_hit DESC;
      `;

      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('[DatabasePerformance] Failed to get index stats:', error);
      return [];
    }
  }

  /**
   * Get table size and index sizes
   */
  async getTableStats(): Promise<any> {
    try {
      const query = `
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
          pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size,
          pg_stat_get_tuples_returned(c.oid) as n_tup_ret,
          pg_stat_get_tuples_fetched(c.oid) as n_tup_fetch,
          pg_stat_get_live_tuples(c.oid) as n_live_tup
        FROM pg_tables 
        JOIN pg_class c ON c.relname = tablename 
        WHERE tablename = 'flashes' AND schemaname = 'public';
      `;

      const result = await this.pool.query(query);
      return result.rows[0] || null;
    } catch (error) {
      console.error('[DatabasePerformance] Failed to get table stats:', error);
      return null;
    }
  }

  /**
   * Check slow queries in the last hour
   */
  async getSlowQueries(): Promise<any[]> {
    try {
      const query = `
        SELECT 
          query,
          mean_exec_time,
          calls,
          total_exec_time,
          rows,
          100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
        FROM pg_stat_statements
        WHERE query LIKE '%flashes%'
        ORDER BY mean_exec_time DESC
        LIMIT 10;
      `;

      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      // pg_stat_statements might not be enabled
      console.warn('[DatabasePerformance] pg_stat_statements not available for slow query analysis');
      return [];
    }
  }

  /**
   * Analyze table to update statistics
   */
  async analyzeFlashesTable(): Promise<void> {
    try {
      console.log('[DatabasePerformance] Analyzing flashes table...');
      await this.pool.query('ANALYZE flashes;');
      console.log('[DatabasePerformance] ✅ Table analysis complete');
    } catch (error) {
      console.error('[DatabasePerformance] Failed to analyze table:', error);
    }
  }

  /**
   * Get comprehensive performance report
   */
  async getPerformanceReport(): Promise<{
    tableStats: any;
    indexStats: any[];
    slowQueries: any[];
  }> {
    console.log('[DatabasePerformance] Generating performance report...');
    
    const [tableStats, indexStats, slowQueries] = await Promise.all([
      this.getTableStats(),
      this.getIndexStats(), 
      this.getSlowQueries()
    ]);

    return {
      tableStats,
      indexStats,
      slowQueries
    };
  }
}