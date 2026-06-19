import { JobStatus as PrismaJobStatus, UrlStatus as PrismaUrlStatus } from '@prisma/client';
import { maskProxy } from './proxy.util';
import type { JobDetail, JobListItem, JobStatus, UrlCheckItem, UrlStatus } from './job.types';

type JobWithUrls = {
  id: string;
  createdAt: Date;
  status: PrismaJobStatus;
  cancelled: boolean;
  proxy: string | null;
  urls: Array<{
    id: string;
    url: string;
    status: PrismaUrlStatus;
    httpStatus: number | null;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationMs: number | null;
    sortOrder: number;
  }>;
};

export function prismaJobStatusToApi(status: PrismaJobStatus): JobStatus {
  return status.toLowerCase() as JobStatus;
}

export function apiJobStatusToPrisma(status: JobStatus): PrismaJobStatus {
  return status.toUpperCase() as PrismaJobStatus;
}

export function prismaUrlStatusToApi(status: PrismaUrlStatus): UrlStatus {
  return status.toLowerCase() as UrlStatus;
}

export function apiUrlStatusToPrisma(status: UrlStatus): PrismaUrlStatus {
  return status.toUpperCase() as PrismaUrlStatus;
}

function mapUrlItem(item: JobWithUrls['urls'][number]): UrlCheckItem {
  return {
    url: item.url,
    status: prismaUrlStatusToApi(item.status),
    ...(item.httpStatus != null && { httpStatus: item.httpStatus }),
    ...(item.errorMessage && { errorMessage: item.errorMessage }),
    ...(item.startedAt && { startedAt: item.startedAt.toISOString() }),
    ...(item.finishedAt && { finishedAt: item.finishedAt.toISOString() }),
    ...(item.durationMs != null && { durationMs: item.durationMs }),
  };
}

export function toJobDetail(job: JobWithUrls): JobDetail {
  return {
    id: job.id,
    createdAt: job.createdAt.toISOString(),
    status: prismaJobStatusToApi(job.status),
    proxy: maskProxy(job.proxy),
    urls: [...job.urls]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(mapUrlItem),
  };
}

export function toJobListItem(job: JobWithUrls): JobListItem {
  const stats = {
    success: 0,
    error: 0,
    pending: 0,
    inProgress: 0,
    cancelled: 0,
  };

  for (const item of job.urls) {
    switch (item.status) {
      case PrismaUrlStatus.SUCCESS:
        stats.success++;
        break;
      case PrismaUrlStatus.ERROR:
        stats.error++;
        break;
      case PrismaUrlStatus.PENDING:
        stats.pending++;
        break;
      case PrismaUrlStatus.IN_PROGRESS:
        stats.inProgress++;
        break;
      case PrismaUrlStatus.CANCELLED:
        stats.cancelled++;
        break;
    }
  }

  return {
    id: job.id,
    createdAt: job.createdAt.toISOString(),
    status: prismaJobStatusToApi(job.status),
    urlCount: job.urls.length,
    proxy: maskProxy(job.proxy),
    jobs: job.urls.map(mapUrlItem),
    stats,
  };
}

export type UrlItemRecord = JobWithUrls['urls'][number];
