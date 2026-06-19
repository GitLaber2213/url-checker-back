import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, interval, map } from 'rxjs';
import type { JobDetail, PaginatedJobsResponse } from './job.types';

@Injectable()
export class JobsEventsService {
  private readonly jobUpdates$ = new Subject<JobDetail>();
  private readonly listUpdates$ = new Subject<PaginatedJobsResponse>();

  emitJobUpdate(detail: JobDetail): void {
    this.jobUpdates$.next(detail);
  }

  emitListUpdate(list: PaginatedJobsResponse): void {
    this.listUpdates$.next(list);
  }

  watchJob(jobId: string, initial: JobDetail): Observable<MessageEvent> {
    const updates$ = this.jobUpdates$.pipe(
      filter((job) => job.id === jobId),
      map((data) => ({ data })),
    );

    const heartbeats$ = interval(30_000).pipe(
      map(() => ({ data: { type: 'heartbeat' as const } })),
    );

    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: initial });
      const updatesSub = updates$.subscribe(subscriber);
      const heartbeatsSub = heartbeats$.subscribe(subscriber);

      return () => {
        updatesSub.unsubscribe();
        heartbeatsSub.unsubscribe();
      };
    });
  }

  watchList(initial: PaginatedJobsResponse): Observable<MessageEvent> {
    const updates$ = this.listUpdates$.pipe(map((data) => ({ data })));

    const heartbeats$ = interval(30_000).pipe(
      map(() => ({ data: { type: 'heartbeat' as const } })),
    );

    return new Observable<MessageEvent>((subscriber) => {
      subscriber.next({ data: initial });
      const updatesSub = updates$.subscribe(subscriber);
      const heartbeatsSub = heartbeats$.subscribe(subscriber);

      return () => {
        updatesSub.unsubscribe();
        heartbeatsSub.unsubscribe();
      };
    });
  }
}
