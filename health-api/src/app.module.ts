import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '../.env',
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
