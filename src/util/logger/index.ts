export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation?: string;
  message: string;
  meta?: any;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metrics?: {
    memory?: NodeJS.MemoryUsage;
    [key: string]: any;
  };
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private service: string;

  constructor(service: string) {
    this.service = service;
  }

  /**
   * Debug level logging
   */
  debug(message: string, meta?: any): void {
    this.log('debug', message, meta);
  }

  /**
   * Info level logging
   */
  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  /**
   * Warning level logging
   */
  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error, meta?: any): void {
    const errorMeta = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : undefined;

    this.log('error', message, meta, { error: errorMeta });
  }

  /**
   * Log operation timing
   */
  logOperation<T>(
    operation: string, 
    fn: () => Promise<T>,
    meta?: any
  ): Promise<T> {
    return this.timeOperation(operation, fn, meta);
  }

  /**
   * Log operation timing (synchronous)
   */
  logOperationSync<T>(
    operation: string, 
    fn: () => T,
    meta?: any
  ): T {
    const startTime = Date.now();
    
    try {
      const result = fn();
      const duration = Date.now() - startTime;
      
      this.log('info', `Operation completed: ${operation}`, meta, { 
        operation, 
        duration 
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.log('error', `Operation failed: ${operation}`, meta, { 
        operation, 
        duration,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack
        }
      });
      
      throw error;
    }
  }

  /**
   * Time an async operation
   */
  private async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    meta?: any
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      this.log('info', `Operation completed: ${operation}`, meta, { 
        operation, 
        duration 
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.log('error', `Operation failed: ${operation}`, meta, { 
        operation, 
        duration,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack
        }
      });
      
      throw error;
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel, 
    message: string, 
    meta?: any, 
    additionalFields?: any
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...(meta && { meta }),
      ...additionalFields
    };

    // In production, you might want to send to a log aggregation service
    // For now, we'll use console with structured output
    this.outputLog(logEntry);
  }

  /**
   * Output log entry
   */
  private outputLog(entry: LogEntry): void {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    if (isDevelopment) {
      // Human-readable format for development
      const timestamp = entry.timestamp.replace('T', ' ').replace('Z', '');
      const level = entry.level.toUpperCase().padEnd(5);
      const service = `[${entry.service}]`.padEnd(20);
      
      let output = `${timestamp} ${level} ${service} ${entry.message}`;
      
      if (entry.operation) {
        output += ` | ${entry.operation}`;
      }
      
      if (entry.duration !== undefined) {
        output += ` (${entry.duration}ms)`;
      }

      // Use appropriate console method
      switch (entry.level) {
        case 'debug':
          console.debug(output);
          break;
        case 'info':
          console.info(output);
          break;
        case 'warn':
          console.warn(output);
          break;
        case 'error':
          console.error(output);
          if (entry.error?.stack) {
            console.error('Stack trace:', entry.error.stack);
          }
          break;
      }

      // Log meta data if present
      if (entry.meta || entry.metrics) {
        console.log('Meta:', { 
          ...(entry.meta || {}), 
          ...(entry.metrics || {}) 
        });
      }
    } else {
      // JSON format for production (easier for log aggregation)
      console.log(JSON.stringify(entry));
    }
  }

  /**
   * Log memory usage
   */
  logMemoryUsage(operation?: string): void {
    const memoryUsage = process.memoryUsage();
    
    this.log('info', operation ? `Memory usage after ${operation}` : 'Memory usage', {}, {
      metrics: { memory: memoryUsage }
    });
  }

  /**
   * Log performance metrics
   */
  logMetrics(metrics: { [key: string]: any }, message?: string): void {
    this.log('info', message || 'Performance metrics', {}, {
      metrics
    });
  }

  /**
   * Create a child logger for a specific operation context
   */
  child(context: { operation?: string; [key: string]: any }): ContextLogger {
    return new ContextLogger(this, context);
  }
}

/**
 * Context logger that automatically includes context in all log entries
 */
export class ContextLogger {
  constructor(
    private parent: Logger,
    private context: { [key: string]: any }
  ) {}

  debug(message: string, meta?: any): void {
    this.parent.debug(message, { ...this.context, ...meta });
  }

  info(message: string, meta?: any): void {
    this.parent.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta?: any): void {
    this.parent.warn(message, { ...this.context, ...meta });
  }

  error(message: string, error?: Error, meta?: any): void {
    this.parent.error(message, error, { ...this.context, ...meta });
  }

  async logOperation<T>(
    operation: string, 
    fn: () => Promise<T>,
    meta?: any
  ): Promise<T> {
    return this.parent.logOperation(operation, fn, { ...this.context, ...meta });
  }

  logOperationSync<T>(
    operation: string, 
    fn: () => T,
    meta?: any
  ): T {
    return this.parent.logOperationSync(operation, fn, { ...this.context, ...meta });
  }
}

// Global logger instances for different services
export const loggers = {
  main: new Logger('main'),
  database: new Logger('database'),
  rabbitmq: new Logger('rabbitmq'),
  api: new Logger('api'),
  cron: new Logger('cron'),
  health: new Logger('health'),
  performance: new Logger('performance')
};

// Convenience function to create service-specific loggers
export function createLogger(service: string): Logger {
  return new Logger(service);
}