#!/usr/bin/env ts-node

import { DatabasePerformance } from '../util/database/performance';
import { HealthChecker } from '../util/health';
import { memoryOptimizer } from '../util/memory/optimizer';
import { loggers } from '../util/logger';
import { config } from '../util/config';
import pool from '../util/database/postgresClient';

const logger = loggers.performance;

async function performanceCheck(): Promise<void> {
  logger.info('Starting performance check...');

  try {
    // Initialize performance tools
    const dbPerformance = new DatabasePerformance(pool);
    const healthChecker = new HealthChecker(
      pool,
      config.rabbitmq.url,
      config.api.spaceInvadersUrl
    );

    console.log('\n🔍 SPACE INVADERS BOT - PERFORMANCE REPORT');
    console.log('==========================================\n');

    // 1. Health Check
    console.log('📊 HEALTH CHECK');
    console.log('---------------');
    const health = await healthChecker.checkHealth();
    
    console.log(`Overall Status: ${getStatusEmoji(health.status)} ${health.status.toUpperCase()}`);
    console.log(`Uptime: ${formatDuration(health.uptime)}`);
    console.log(`Failed Flashes: ${health.metrics.failedFlashesCount}`);
    
    // Service statuses
    Object.entries(health.services).forEach(([service, status]) => {
      const emoji = getStatusEmoji(status.status);
      const responseTime = status.responseTime ? ` (${status.responseTime}ms)` : '';
      console.log(`  ${emoji} ${service}: ${status.status}${responseTime}`);
      if (status.error) {
        console.log(`    Error: ${status.error}`);
      }
    });

    console.log('\n💾 MEMORY USAGE');
    console.log('----------------');
    const memStats = memoryOptimizer.getMemoryStats();
    console.log(`RSS: ${memStats.formatted.rss}`);
    console.log(`Heap Total: ${memStats.formatted.heapTotal}`);
    console.log(`Heap Used: ${memStats.formatted.heapUsed}`);
    console.log(`External: ${memStats.formatted.external}`);

    // 2. Database Performance
    console.log('\n🗄️  DATABASE PERFORMANCE');
    console.log('------------------------');
    
    const performanceReport = await dbPerformance.getPerformanceReport();
    
    if (performanceReport.tableStats) {
      const stats = performanceReport.tableStats;
      console.log(`Table Size: ${stats.table_size}`);
      console.log(`Index Size: ${stats.index_size}`);
      console.log(`Total Size: ${stats.total_size}`);
      console.log(`Live Tuples: ${stats.n_live_tup?.toLocaleString() || 'N/A'}`);
      console.log(`Tuples Returned: ${stats.n_tup_ret?.toLocaleString() || 'N/A'}`);
    }

    console.log('\n📈 INDEX PERFORMANCE');
    console.log('--------------------');
    if (performanceReport.indexStats.length > 0) {
      performanceReport.indexStats.forEach(index => {
        console.log(`${index.indexname}: ${index.hit_ratio_percent}% hit ratio`);
        console.log(`  Blocks Read: ${index.idx_blks_read?.toLocaleString() || '0'}`);
        console.log(`  Blocks Hit: ${index.idx_blks_hit?.toLocaleString() || '0'}`);
      });
    } else {
      console.log('No index statistics available');
    }

    console.log('\n🐌 SLOW QUERIES');
    console.log('---------------');
    if (performanceReport.slowQueries.length > 0) {
      performanceReport.slowQueries.slice(0, 5).forEach((query, i) => {
        console.log(`${i + 1}. Avg Time: ${Math.round(query.mean_exec_time)}ms | Calls: ${query.calls}`);
        console.log(`   Query: ${query.query.substring(0, 100)}...`);
        if (query.hit_percent !== null) {
          console.log(`   Cache Hit: ${Math.round(query.hit_percent)}%`);
        }
      });
    } else {
      console.log('No slow query data available (pg_stat_statements not enabled)');
    }

    // 3. Recommendations
    console.log('\n💡 RECOMMENDATIONS');
    console.log('-------------------');
    const recommendations = generateRecommendations(health, performanceReport, memStats);
    recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });

    console.log('\n✅ Performance check completed successfully');

  } catch (error) {
    logger.error('Performance check failed', error as Error);
    console.error('❌ Performance check failed:', (error as Error).message);
    process.exit(1);
  }
}

async function applyOptimizations(): Promise<void> {
  logger.info('Applying performance optimizations...');

  try {
    const dbPerformance = new DatabasePerformance(pool);

    console.log('\n🚀 APPLYING PERFORMANCE OPTIMIZATIONS');
    console.log('======================================\n');

    // Apply database indexes
    console.log('📊 Applying database indexes...');
    await dbPerformance.applyPerformanceIndexes();

    // Analyze table
    console.log('📈 Analyzing flashes table...');
    await dbPerformance.analyzeFlashesTable();

    console.log('\n✅ Optimizations applied successfully');
    console.log('\nRecommended next steps:');
    console.log('1. Monitor index usage over the next few hours');
    console.log('2. Run performance check again to see improvements');
    console.log('3. Consider enabling pg_stat_statements for query analysis');

  } catch (error) {
    logger.error('Failed to apply optimizations', error as Error);
    console.error('❌ Failed to apply optimizations:', (error as Error).message);
    process.exit(1);
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '✅';
    case 'degraded': return '⚠️';
    case 'unhealthy': return '❌';
    default: return '❓';
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function generateRecommendations(
  health: any, 
  dbPerf: any, 
  memStats: any
): string[] {
  const recommendations: string[] = [];

  // Health-based recommendations
  if (health.status !== 'healthy') {
    const unhealthyServices = Object.entries(health.services)
      .filter(([_, status]: [string, any]) => status.status === 'unhealthy')
      .map(([service]) => service);
    
    if (unhealthyServices.length > 0) {
      recommendations.push(`Address unhealthy services: ${unhealthyServices.join(', ')}`);
    }
  }

  if (health.metrics.failedFlashesCount > 5) {
    recommendations.push('Clear failed flashes or investigate recurring failures');
  }

  // Memory-based recommendations
  const heapUsedMB = memStats.usage.heapUsed / 1024 / 1024;
  if (heapUsedMB > 512) {
    recommendations.push('Consider increasing GC frequency or optimizing memory usage');
  }

  // Database recommendations
  if (dbPerf.indexStats.length === 0) {
    recommendations.push('Apply database performance indexes using --optimize flag');
  } else {
    const lowHitRatios = dbPerf.indexStats.filter((idx: any) => idx.hit_ratio_percent < 95);
    if (lowHitRatios.length > 0) {
      recommendations.push('Some indexes have low hit ratios - monitor query patterns');
    }
  }

  if (dbPerf.slowQueries.length > 0) {
    const avgSlowTime = dbPerf.slowQueries[0]?.mean_exec_time;
    if (avgSlowTime > 1000) {
      recommendations.push('Optimize slow queries or add targeted indexes');
    }
  }

  // Service-specific recommendations
  Object.entries(health.services).forEach(([service, status]: [string, any]) => {
    if (status.responseTime && status.responseTime > 2000) {
      recommendations.push(`${service} response time is high (${status.responseTime}ms) - investigate`);
    }
  });

  if (recommendations.length === 0) {
    recommendations.push('System is performing well! Continue monitoring.');
  }

  return recommendations;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'check':
    case undefined:
      await performanceCheck();
      break;
    
    case 'optimize':
      await applyOptimizations();
      break;
    
    case 'full':
      console.log('Running full performance optimization...\n');
      await applyOptimizations();
      console.log('\n' + '='.repeat(50) + '\n');
      await performanceCheck();
      break;
    
    default:
      console.log('Space Invaders Bot - Performance Monitor');
      console.log('Usage:');
      console.log('  yarn performance-monitor [command]');
      console.log('');
      console.log('Commands:');
      console.log('  check     Run performance check (default)');
      console.log('  optimize  Apply performance optimizations');
      console.log('  full      Apply optimizations then run check');
      process.exit(1);
  }

  await pool.end();
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
}