import { Global, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JOB_CANCEL_KEY_PREFIX } from '../jobs/job-queue.constants';

function redisOptions(host: string, port: number) {
  return {
    host,
    port,
    family: 4,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => Math.min(times * 500, 5000),
  };
}

@Global()
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('REDIS_HOST', 'localhost');
    const port = this.config.get<number>('REDIS_PORT', 6379);

    this.client = new Redis(redisOptions(host, port));

    this.client.on('error', (err) => {
      this.logger.error(
        `Redis connection error (${host}:${port}): ${err.message}. ` +
          'Start Redis: docker compose up redis -d',
      );
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async markJobCancelled(jobId: string): Promise<void> {
    await this.client.set(`${JOB_CANCEL_KEY_PREFIX}${jobId}`, '1');
  }

  async isJobCancelled(jobId: string): Promise<boolean> {
    const value = await this.client.get(`${JOB_CANCEL_KEY_PREFIX}${jobId}`);
    return value === '1';
  }

  async clearJobCancelled(jobId: string): Promise<void> {
    await this.client.del(`${JOB_CANCEL_KEY_PREFIX}${jobId}`);
  }
}

export { redisOptions };
