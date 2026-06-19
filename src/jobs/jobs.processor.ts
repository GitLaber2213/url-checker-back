import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobsService } from './jobs.service';
import {
  JOB_PROCESSING_QUEUE,
  ProcessJobPayload,
} from './job-queue.constants';

@Processor(JOB_PROCESSING_QUEUE)
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(private readonly jobsService: JobsService) {
    super();
  }

  async process(job: Job<ProcessJobPayload>): Promise<void> {
    this.logger.log(`Processing job ${job.data.jobId}`);
    await this.jobsService.processJob(job.data.jobId);
  }
}
