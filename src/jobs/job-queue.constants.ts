export const JOB_PROCESSING_QUEUE = 'job-processing';

export interface ProcessJobPayload {
  jobId: string;
}

export const JOB_CANCEL_KEY_PREFIX = 'job:cancel:';
