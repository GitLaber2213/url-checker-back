import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { redisOptions } from './redis/redis.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisOptions(
          config.get<string>('REDIS_HOST', 'localhost'),
          config.get<number>('REDIS_PORT', 6379),
        ),
      }),
    }),
    PrismaModule,
    RedisModule,
    JobsModule,
  ],
})
export class AppModule {}
