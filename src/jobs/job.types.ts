export type JobStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type UrlStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'error'
  | 'cancelled';

export interface UrlCheckItem {
  url: string;
  status: UrlStatus;
  httpStatus?: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface JobListItem {
  id: string;
  createdAt: string;
  status: JobStatus;
  urlCount: number;
  proxy: string | null;
  jobs: UrlCheckItem[];
  stats: {
    success: number;
    error: number;
    pending: number;
    inProgress: number;
    cancelled: number;
  };
}

export interface JobDetail {
  id: string;
  createdAt: string;
  status: JobStatus;
  proxy: string | null;
  urls: UrlCheckItem[];
}

export interface PaginatedJobsResponse {
  items: JobListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
