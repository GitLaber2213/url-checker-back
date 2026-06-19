import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_JOBS_PAGE_SIZE,
  MAX_JOBS_PAGE_SIZE,
} from '../jobs-pagination.constants';

export interface ListJobsQuery {
  page: number;
  limit: number;
}

export function parseListJobsQuery(
  pageRaw?: string,
  limitRaw?: string,
): ListJobsQuery {
  const page = pageRaw ? Number.parseInt(pageRaw, 10) : 1;
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_JOBS_PAGE_SIZE;

  if (!Number.isFinite(page) || page < 1) {
    throw new BadRequestException('page must be a positive integer');
  }

  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_JOBS_PAGE_SIZE) {
    throw new BadRequestException(
      `limit must be between 1 and ${MAX_JOBS_PAGE_SIZE}`,
    );
  }

  return { page, limit };
}
