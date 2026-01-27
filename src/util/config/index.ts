import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig({ path: '.env' });

export interface AppConfig {
  // Database configuration
  database: {
    url: string;
    pool: {
      max: number;
      min: number;
      idleTimeoutMillis: number;
      connectionTimeoutMillis: number;
      statementTimeout: number;
      queryTimeout: number;
    };
  };

  // RabbitMQ configuration  
  rabbitmq: {
    url: string;
    queue: string;
    batchSize: number;
    concurrency: number;
  };

  // API configuration
  api: {
    spaceInvadersUrl: string;
    timeout: number;
  };

  // Proxy configuration
  proxy: {
    list: string[];
    fallbackList: string[];
  };

  // Cron configuration
  cron: {
    schedule: string;
    flashTimespanMins: number;
    retryLookbackDays: number;
    maxRetriesPerRun: number;
  };

  // Security configuration
  security: {
    signerEncryptionKey: string;
  };

  // Performance configuration
  performance: {
    batchSize: number;
    concurrencyLimit: number;
    gcThreshold: number;
    monitoringInterval: number;
  };

  // Environment
  env: 'development' | 'test' | 'production';
  
  // Logging
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    structured: boolean;
  };
}

class ConfigManager {
  private _config: AppConfig | null = null;

  /**
   * Get the application configuration
   */
  get config(): AppConfig {
    if (!this._config) {
      this._config = this.loadConfig();
    }
    return this._config;
  }

  /**
   * Reload configuration (useful for testing)
   */
  reload(): AppConfig {
    this._config = this.loadConfig();
    return this._config;
  }

  /**
   * Load configuration from environment variables with validation
   */
  private loadConfig(): AppConfig {
    // Validate required environment variables
    this.validateRequiredEnvVars();

    const config: AppConfig = {
      database: {
        url: this.getRequiredEnv('DATABASE_URL'),
        pool: {
          max: this.getNumericEnv('DB_POOL_MAX', 20),
          min: this.getNumericEnv('DB_POOL_MIN', 2),
          idleTimeoutMillis: this.getNumericEnv('DB_IDLE_TIMEOUT', 30000),
          connectionTimeoutMillis: this.getNumericEnv('DB_CONNECTION_TIMEOUT', 2000),
          statementTimeout: this.getNumericEnv('DB_STATEMENT_TIMEOUT', 5000),
          queryTimeout: this.getNumericEnv('DB_QUERY_TIMEOUT', 5000)
        }
      },

      rabbitmq: {
        url: this.getRequiredEnv('RABBITMQ_URL'),
        queue: this.getRequiredEnv('RABBITMQ_QUEUE'),
        batchSize: this.getNumericEnv('RABBITMQ_BATCH_SIZE', 50),
        concurrency: this.getNumericEnv('RABBITMQ_CONCURRENCY', 5)
      },

      api: {
        spaceInvadersUrl: this.getEnv('API_URL', 'https://api.space-invaders.com'),
        timeout: this.getNumericEnv('API_TIMEOUT', 15000)
      },

      proxy: {
        list: this.parseProxyList(this.getEnv('PROXY_LIST', '')),
        fallbackList: this.parseProxyList(this.getEnv('FALLBACK_PROXY_LIST', ''))
      },

      cron: {
        schedule: this.getEnv('CRON_SCHEDULE', '*/5 * * * *'),
        flashTimespanMins: this.getNumericEnv('FLASH_TIMESPAN_MINS', 60),
        retryLookbackDays: this.getNumericEnv('RETRY_LOOKBACK_DAYS', 7),
        maxRetriesPerRun: this.getNumericEnv('MAX_RETRIES_PER_RUN', 50)
      },

      security: {
        signerEncryptionKey: this.getRequiredEnv('SIGNER_ENCRYPTION_KEY')
      },

      performance: {
        batchSize: this.getNumericEnv('MEMORY_BATCH_SIZE', 100),
        concurrencyLimit: this.getNumericEnv('MEMORY_CONCURRENCY_LIMIT', 10),
        gcThreshold: this.getNumericEnv('MEMORY_GC_THRESHOLD', 512),
        monitoringInterval: this.getNumericEnv('MEMORY_MONITORING_INTERVAL', 30000)
      },

      env: this.getEnv('NODE_ENV', 'development') as 'development' | 'test' | 'production',

      logging: {
        level: this.getEnv('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
        structured: this.getBooleanEnv('LOG_STRUCTURED', false)
      }
    };

    // Validate configuration
    this.validateConfig(config);

    return config;
  }

  /**
   * Validate that all required environment variables are present
   */
  private validateRequiredEnvVars(): void {
    const required = [
      'DATABASE_URL',
      'RABBITMQ_URL', 
      'RABBITMQ_QUEUE',
      'SIGNER_ENCRYPTION_KEY'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Validate the loaded configuration
   */
  private validateConfig(config: AppConfig): void {
    // Validate database URL format
    try {
      new URL(config.database.url);
    } catch {
      throw new Error('Invalid DATABASE_URL format');
    }

    // Validate RabbitMQ URL format
    try {
      new URL(config.rabbitmq.url);
    } catch {
      throw new Error('Invalid RABBITMQ_URL format');
    }

    // Validate API URL format
    try {
      new URL(config.api.spaceInvadersUrl);
    } catch {
      throw new Error('Invalid API_URL format');
    }

    // Validate numeric ranges
    if (config.database.pool.max <= 0 || config.database.pool.max > 100) {
      throw new Error('DB_POOL_MAX must be between 1 and 100');
    }

    if (config.database.pool.min < 0 || config.database.pool.min >= config.database.pool.max) {
      throw new Error('DB_POOL_MIN must be >= 0 and < DB_POOL_MAX');
    }

    if (config.performance.batchSize <= 0 || config.performance.batchSize > 10000) {
      throw new Error('MEMORY_BATCH_SIZE must be between 1 and 10000');
    }

    // Validate cron schedule format (basic validation)
    const cronParts = config.cron.schedule.split(' ');
    if (cronParts.length !== 5) {
      throw new Error('CRON_SCHEDULE must be in valid cron format (5 parts)');
    }

    // Validate encryption key length
    if (config.security.signerEncryptionKey.length < 16) {
      throw new Error('SIGNER_ENCRYPTION_KEY must be at least 16 characters');
    }

    // Validate environment
    if (!['development', 'test', 'production'].includes(config.env)) {
      throw new Error('NODE_ENV must be one of: development, test, production');
    }

    // Validate log level
    if (!['debug', 'info', 'warn', 'error'].includes(config.logging.level)) {
      throw new Error('LOG_LEVEL must be one of: debug, info, warn, error');
    }
  }

  /**
   * Get required environment variable
   */
  private getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Environment variable ${key} is required but not set`);
    }
    return value;
  }

  /**
   * Get optional environment variable with default
   */
  private getEnv(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  /**
   * Get numeric environment variable with default and validation
   */
  private getNumericEnv(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
    }

    return parsed;
  }

  /**
   * Get boolean environment variable
   */
  private getBooleanEnv(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;

    const lower = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(lower)) return true;
    if (['false', '0', 'no', 'off'].includes(lower)) return false;

    throw new Error(`Environment variable ${key} must be a boolean value, got: ${value}`);
  }

  /**
   * Parse proxy list from environment variable
   */
  private parseProxyList(proxyListStr: string): string[] {
    if (!proxyListStr.trim()) return [];

    return proxyListStr
      .split(',')
      .map(proxy => proxy.trim())
      .filter(proxy => proxy.length > 0);
  }

  /**
   * Get configuration as JSON (useful for debugging)
   */
  toJSON(): any {
    const config = { ...this.config };
    
    // Redact sensitive information
    config.database.url = this.redactUrl(config.database.url);
    config.rabbitmq.url = this.redactUrl(config.rabbitmq.url);
    config.security.signerEncryptionKey = '***REDACTED***';
    
    return config;
  }

  /**
   * Redact sensitive information from URLs
   */
  private redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.username || parsed.password) {
        parsed.username = '***';
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      return '***INVALID_URL***';
    }
  }

  /**
   * Check if running in development mode
   */
  get isDevelopment(): boolean {
    return this.config.env === 'development';
  }

  /**
   * Check if running in test mode
   */
  get isTest(): boolean {
    return this.config.env === 'test';
  }

  /**
   * Check if running in production mode
   */
  get isProduction(): boolean {
    return this.config.env === 'production';
  }
}

// Export singleton instance
export const configManager = new ConfigManager();

// Export the config object for convenience
export const config = configManager.config;