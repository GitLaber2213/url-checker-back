import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisOptions } from '../redis/redis.service';
import { JobsEventsService } from './jobs-events.service';
import { JobsController } from './jobs.controller';
import { JobsProcessor } from './jobs.processor';
import { JobsService } from './jobs.service';
import { UrlCheckerService } from './url-checker.service';
import { JOB_PROCESSING_QUEUE } from './job-queue.constants';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: JOB_PROCESSING_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisOptions(
          config.get<string>('REDIS_HOST', 'localhost'),
          config.get<number>('REDIS_PORT', 6379),
        ),
      }),
    }),
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsProcessor, UrlCheckerService, JobsEventsService],
})
export class JobsModule {}
