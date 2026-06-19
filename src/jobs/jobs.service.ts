import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { JobStatus as PrismaJobStatus, UrlStatus as PrismaUrlStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { CreateJobDto } from './dto/create-job.dto';
import type {
  JobDetail,
  JobListItem,
  PaginatedJobsResponse,
  UrlCheckItem,
} from './job.types';
import { DEFAULT_JOBS_PAGE_SIZE } from './jobs-pagination.constants';
import {
  apiUrlStatusToPrisma,
  toJobDetail,
  toJobListItem,
  type UrlItemRecord,
} from './job.mapper';
import {
  JOB_PROCESSING_QUEUE,
  ProcessJobPayload,
} from './job-queue.constants';
import { UrlCheckerService } from './url-checker.service';
import { JobsEventsService } from './jobs-events.service';
import { normalizeProxy } from './proxy.util';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const jobInclude = {
  urls: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly urlChecker: UrlCheckerService,
    private readonly jobsEvents: JobsEventsService,
    @InjectQueue(JOB_PROCESSING_QUEUE)
    private readonly jobQueue: Queue<ProcessJobPayload>,
  ) {}

  async create(dto: CreateJobDto): Promise<{ jobId: string }> {
    if (!dto.urls || !Array.isArray(dto.urls) || dto.urls.length === 0) {
      throw new BadRequestException('urls must be a non-empty array');
    }

    const normalizedUrls = dto.urls.map((u) => String(u).trim()).filter(Boolean);
    if (normalizedUrls.length === 0) {
      throw new BadRequestException('urls must contain at least one valid URL');
    }

    for (const url of normalizedUrls) {
      try {
        new URL(url);
      } catch {
        throw new BadRequestException(`Invalid URL: ${url}`);
      }
    }

    const proxy = normalizeProxy(dto.proxy);

    const job = await this.prisma.job.create({
      data: {
        status: PrismaJobStatus.PENDING,
        proxy: proxy ?? null,
        urls: {
          create: normalizedUrls.map((url, index) => ({
            url,
            sortOrder: index,
            status: PrismaUrlStatus.PENDING,
          })),
        },
      },
    });

    await this.jobQueue.add(
      'process',
      { jobId: job.id },
      { jobId: job.id, removeOnComplete: true, removeOnFail: false },
    );

    void this.notifyJobChanged(job.id);

    return { jobId: job.id };
  }

  async findAllPaginated(
    page = 1,
    limit = DEFAULT_JOBS_PAGE_SIZE,
  ): Promise<PaginatedJobsResponse> {
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        include: jobInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.job.count(),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      items: jobs.map(toJobListItem),
      page,
      limit,
      total,
      totalPages,
    };
  }

  async findOne(id: string): Promise<JobDetail> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: jobInclude,
    });

    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    return toJobDetail(job);
  }

  async cancel(id: string): Promise<JobDetail> {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: jobInclude,
    });

    if (!job) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    if (
      job.status === PrismaJobStatus.COMPLETED ||
      job.status === PrismaJobStatus.CANCELLED
    ) {
      return toJobDetail(job);
    }

    await this.redis.markJobCancelled(id);

    await this.prisma.$transaction([
      this.prisma.job.update({
        where: { id },
        data: {
          cancelled: true,
          status: PrismaJobStatus.CANCELLED,
        },
      }),
      this.prisma.urlCheckItem.updateMany({
        where: { jobId: id, status: PrismaUrlStatus.PENDING },
        data: { status: PrismaUrlStatus.CANCELLED },
      }),
    ]);

    void this.notifyJobChanged(id);

    return this.findOne(id);
  }

  async processJob(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: jobInclude,
    });

    if (!job) return;

    if (job.cancelled || (await this.redis.isJobCancelled(jobId))) {
      return;
    }

    const urlRecords = job.urls;
    const urlItems: UrlCheckItem[] = urlRecords.map((item) => ({
      url: item.url,
      status: item.status.toLowerCase() as UrlCheckItem['status'],
    }));

    try {
      await this.urlChecker.processJobUrls(
        urlItems,
        () => this.isCancelled(jobId),
        (index, patch) =>
          this.updateUrlItem(urlRecords[index].id, patch).then(() =>
            this.refreshJobStatus(jobId).then(() =>
              this.notifyJobChanged(jobId),
            ),
          ),
        () => this.markJobInProgress(jobId),
        () => this.refreshJobStatus(jobId),
        job.proxy ?? undefined,
      );
    } catch (err) {
      this.logger.error(`Job ${jobId} failed`, err);
      const cancelled = await this.isCancelled(jobId);
      if (!cancelled) {
        await this.prisma.job.update({
          where: { id: jobId },
          data: { status: PrismaJobStatus.FAILED },
        });
      }
    } finally {
      await this.redis.clearJobCancelled(jobId);
      void this.notifyJobChanged(jobId);
    }
  }

  private async notifyJobChanged(jobId: string): Promise<void> {
    try {
      const [detail, list] = await Promise.all([
        this.findOne(jobId),
        this.findAllPaginated(1, DEFAULT_JOBS_PAGE_SIZE),
      ]);
      this.jobsEvents.emitJobUpdate(detail);
      this.jobsEvents.emitListUpdate(list);
    } catch (err) {
      this.logger.warn(`Failed to emit SSE for job ${jobId}`, err);
    }
  }

  private async isCancelled(jobId: string): Promise<boolean> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { cancelled: true },
    });
    return Boolean(job?.cancelled) || (await this.redis.isJobCancelled(jobId));
  }

  private async markJobInProgress(jobId: string): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id: jobId, status: PrismaJobStatus.PENDING },
      data: { status: PrismaJobStatus.IN_PROGRESS },
    });
  }

  private async updateUrlItem(
    id: string,
    patch: Partial<UrlCheckItem>,
  ): Promise<void> {
    await this.prisma.urlCheckItem.update({
      where: { id },
      data: {
        ...(patch.status && { status: apiUrlStatusToPrisma(patch.status) }),
        ...(patch.httpStatus !== undefined && { httpStatus: patch.httpStatus }),
        ...(patch.errorMessage !== undefined && {
          errorMessage: patch.errorMessage,
        }),
        ...(patch.startedAt && { startedAt: new Date(patch.startedAt) }),
        ...(patch.finishedAt && { finishedAt: new Date(patch.finishedAt) }),
        ...(patch.durationMs !== undefined && { durationMs: patch.durationMs }),
      },
    });
  }

  private async refreshJobStatus(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { urls: true },
    });

    if (!job) return;

    if (job.cancelled || (await this.redis.isJobCancelled(jobId))) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: PrismaJobStatus.CANCELLED, cancelled: true },
      });
      return;
    }

    const statuses = job.urls.map((u: UrlItemRecord) => u.status);
    const hasActive = statuses.some(
      (s) => s === PrismaUrlStatus.PENDING || s === PrismaUrlStatus.IN_PROGRESS,
    );

    if (hasActive) {
      const nextStatus = statuses.includes(PrismaUrlStatus.IN_PROGRESS)
        ? PrismaJobStatus.IN_PROGRESS
        : PrismaJobStatus.PENDING;

      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: nextStatus },
      });
      return;
    }

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: PrismaJobStatus.COMPLETED },
    });
  }
}
