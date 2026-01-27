import { loggers } from '../logger';

export interface MemoryOptimizationConfig {
  batchSize: number;
  concurrencyLimit: number;
  gcThreshold: number; // MB
  monitoringInterval: number; // ms
}

export class MemoryOptimizer {
  private config: MemoryOptimizationConfig;
  private logger = loggers.performance;

  constructor(config?: Partial<MemoryOptimizationConfig>) {
    this.config = {
      batchSize: parseInt(process.env.MEMORY_BATCH_SIZE || '100'),
      concurrencyLimit: parseInt(process.env.MEMORY_CONCURRENCY_LIMIT || '10'),
      gcThreshold: parseInt(process.env.MEMORY_GC_THRESHOLD || '512'),
      monitoringInterval: parseInt(process.env.MEMORY_MONITORING_INTERVAL || '30000'),
      ...config
    };
  }

  /**
   * Process large arrays in memory-efficient batches
   */
  async processBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    options?: {
      batchSize?: number;
      concurrencyLimit?: number;
      onBatchComplete?: (batchIndex: number, results: R[]) => void;
    }
  ): Promise<R[]> {
    const batchSize = options?.batchSize || this.config.batchSize;
    const concurrencyLimit = options?.concurrencyLimit || this.config.concurrencyLimit;
    
    this.logger.info(`Processing ${items.length} items in batches of ${batchSize} with concurrency ${concurrencyLimit}`);
    
    const results: R[] = [];
    const totalBatches = Math.ceil(items.length / batchSize);
    
    for (let i = 0; i < items.length; i += batchSize * concurrencyLimit) {
      const batchPromises: Promise<R[]>[] = [];
      
      // Create concurrent batches
      for (let j = 0; j < concurrencyLimit && i + j * batchSize < items.length; j++) {
        const startIdx = i + j * batchSize;
        const endIdx = Math.min(startIdx + batchSize, items.length);
        const batch = items.slice(startIdx, endIdx);
        
        batchPromises.push(
          this.processBatchWithMemoryMonitoring(
            batch, 
            processor, 
            Math.floor(startIdx / batchSize)
          )
        );
      }
      
      // Process concurrent batches
      const batchResults = await Promise.all(batchPromises);
      
      // Collect results and notify
      for (let k = 0; k < batchResults.length; k++) {
        results.push(...batchResults[k]);
        
        if (options?.onBatchComplete) {
          const batchIndex = Math.floor((i + k * batchSize) / batchSize);
          options.onBatchComplete(batchIndex, batchResults[k]);
        }
      }
      
      // Force garbage collection if memory usage is high
      await this.checkAndTriggerGC();
      
      // Small delay between batch groups to prevent overwhelming
      if (i + batchSize * concurrencyLimit < items.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    this.logger.info(`Completed processing ${items.length} items in ${totalBatches} batches`);
    return results;
  }

  /**
   * Process a batch with memory monitoring
   */
  private async processBatchWithMemoryMonitoring<T, R>(
    batch: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchIndex: number
  ): Promise<R[]> {
    const startMemory = process.memoryUsage();
    const startTime = Date.now();
    
    try {
      const results = await processor(batch);
      
      const endMemory = process.memoryUsage();
      const duration = Date.now() - startTime;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      
      this.logger.debug(`Batch ${batchIndex} completed`, {
        batchSize: batch.length,
        duration,
        memoryDelta: this.formatBytes(memoryDelta),
        currentMemory: this.formatBytes(endMemory.heapUsed)
      });
      
      return results;
    } catch (error) {
      this.logger.error(`Batch ${batchIndex} failed`, error as Error, {
        batchSize: batch.length
      });
      throw error;
    }
  }

  /**
   * Optimized array flattening that doesn't create intermediate arrays
   */
  flattenArraysEfficiently<T>(...arrays: T[][]): T[] {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Array<T>(totalLength);
    
    let index = 0;
    for (const arr of arrays) {
      for (const item of arr) {
        result[index++] = item;
      }
    }
    
    return result;
  }

  /**
   * Streaming filter that processes items without creating intermediate arrays
   */
  async streamFilter<T>(
    items: T[],
    predicate: (item: T) => boolean | Promise<boolean>,
    onFiltered?: (item: T) => void
  ): Promise<T[]> {
    const result: T[] = [];
    const batchSize = Math.min(this.config.batchSize, 1000);
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      for (const item of batch) {
        const shouldInclude = await predicate(item);
        if (shouldInclude) {
          result.push(item);
          onFiltered?.(item);
        }
      }
      
      // Yield control periodically
      if (i % (batchSize * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
    
    return result;
  }

  /**
   * Memory-efficient Set operations
   */
  createOptimizedSet<T>(items: T[], keyExtractor?: (item: T) => string | number): Set<string | number | T> {
    if (keyExtractor) {
      const set = new Set<string | number>();
      for (const item of items) {
        set.add(keyExtractor(item));
      }
      return set;
    } else {
      return new Set(items);
    }
  }

  /**
   * Clear arrays and objects efficiently
   */
  clearMemory(...targets: any[]): void {
    for (const target of targets) {
      if (Array.isArray(target)) {
        target.length = 0;
      } else if (typeof target === 'object' && target !== null) {
        Object.keys(target).forEach(key => {
          delete target[key];
        });
      }
    }
  }

  /**
   * Monitor memory usage and trigger GC if needed
   */
  private async checkAndTriggerGC(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > this.config.gcThreshold) {
      this.logger.warn(`High memory usage detected: ${this.formatBytes(memoryUsage.heapUsed)}. Triggering GC.`);
      
      if (global.gc) {
        global.gc();
        
        const afterGC = process.memoryUsage();
        const freed = memoryUsage.heapUsed - afterGC.heapUsed;
        
        this.logger.info(`GC completed. Freed: ${this.formatBytes(freed)}`);
      } else {
        this.logger.warn('GC not available. Run with --expose-gc flag to enable manual GC.');
      }
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): {
    usage: NodeJS.MemoryUsage;
    formatted: {
      rss: string;
      heapTotal: string;
      heapUsed: string;
      external: string;
      arrayBuffers: string;
    };
  } {
    const usage = process.memoryUsage();
    
    return {
      usage,
      formatted: {
        rss: this.formatBytes(usage.rss),
        heapTotal: this.formatBytes(usage.heapTotal),
        heapUsed: this.formatBytes(usage.heapUsed),
        external: this.formatBytes(usage.external),
        arrayBuffers: this.formatBytes(usage.arrayBuffers)
      }
    };
  }

  /**
   * Start continuous memory monitoring
   */
  startMemoryMonitoring(): NodeJS.Timeout {
    return setInterval(() => {
      const stats = this.getMemoryStats();
      this.logger.debug('Memory stats', { memory: stats.formatted });
      
      // Log warning if memory is getting high
      const heapUsedMB = stats.usage.heapUsed / 1024 / 1024;
      if (heapUsedMB > this.config.gcThreshold * 0.8) {
        this.logger.warn(`High memory usage: ${stats.formatted.heapUsed}`, {
          threshold: `${this.config.gcThreshold}MB`
        });
      }
    }, this.config.monitoringInterval);
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Global memory optimizer instance
export const memoryOptimizer = new MemoryOptimizer();