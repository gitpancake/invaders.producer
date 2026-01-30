import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 requests per minute for basic health
  async getHealth() {
    return this.healthService.getQuickHealth();
  }

  @Get('detailed')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute for detailed
  async getDetailedHealth(@Headers('x-api-key') apiKey: string) {
    // Simple API key check
    if (apiKey !== process.env.HEALTH_API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.healthService.getDetailedHealth();
  }

  @Get('metrics')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getMetrics(@Headers('x-api-key') apiKey: string) {
    if (apiKey !== process.env.HEALTH_API_KEY) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.healthService.getMetrics();
  }
}
