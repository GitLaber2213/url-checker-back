import { Injectable } from '@nestjs/common';
import { headWithProxy } from './proxy-fetch.util';
import { UrlCheckItem } from './job.types';

const MAX_CONCURRENT_PER_JOB = 5;
const HEAD_TIMEOUT_MS = 15_000;

function randomDelayMs(): number {
  return Math.floor(Math.random() * 10_001);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkCancelled(
  isCancelled: () => boolean | Promise<boolean>,
): Promise<boolean> {
  return Promise.resolve(isCancelled());
}

@Injectable()
export class UrlCheckerService {
  async checkUrl(
    url: string,
    isCancelled: () => boolean | Promise<boolean>,
    onUpdate: (patch: Partial<UrlCheckItem>) => void | Promise<void>,
    proxy?: string,
  ): Promise<void> {
    if (await checkCancelled(isCancelled)) {
      await onUpdate({ status: 'cancelled' });
      return;
    }

    const startedAt = new Date().toISOString();
    await onUpdate({ status: 'in_progress', startedAt });

    let httpStatus: number | undefined;
    let errorMessage: string | undefined;
    let success = false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);

      const result = await headWithProxy(url, controller.signal, proxy);

      clearTimeout(timeout);
      httpStatus = result.status;
      success = result.status >= 200 && result.status < 400;
      if (!success) {
        errorMessage = `HTTP ${result.status} ${result.statusText}`.trim();
      }
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : 'Unknown error during HEAD request';
    }

    await sleep(randomDelayMs());

    if (await checkCancelled(isCancelled)) {
      await onUpdate({
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      });
      return;
    }

    const finishedAt = new Date().toISOString();
    const durationMs =
      new Date(finishedAt).getTime() - new Date(startedAt).getTime();

    await onUpdate({
      status: success ? 'success' : 'error',
      httpStatus,
      errorMessage,
      finishedAt,
      durationMs,
    });
  }

  async processJobUrls(
    urls: UrlCheckItem[],
    isCancelled: () => boolean | Promise<boolean>,
    onUrlUpdate: (
      index: number,
      patch: Partial<UrlCheckItem>,
    ) => void | Promise<void>,
    onJobStarted: () => void | Promise<void>,
    onJobFinished: () => void | Promise<void>,
    proxy?: string,
  ): Promise<void> {
    const pendingIndices = urls
      .map((_, i) => i)
      .filter((i) => urls[i].status === 'pending');

    if (pendingIndices.length === 0) {
      await onJobFinished();
      return;
    }

    await onJobStarted();

    let active = 0;
    let cursor = 0;
    let settled = false;

    await new Promise<void>((resolve, reject) => {
      const tryFinish = () => {
        if (settled) return;
        if (active === 0 && cursor >= pendingIndices.length) {
          settled = true;
          void Promise.resolve(onJobFinished()).then(resolve);
        }
      };

      const cancelRemaining = async () => {
        for (let i = cursor; i < pendingIndices.length; i++) {
          const idx = pendingIndices[i];
          if (urls[idx].status === 'pending') {
            await onUrlUpdate(idx, { status: 'cancelled' });
          }
        }
        cursor = pendingIndices.length;
      };

      const launchNext = () => {
        void (async () => {
          while (
            active < MAX_CONCURRENT_PER_JOB &&
            cursor < pendingIndices.length &&
            !(await checkCancelled(isCancelled))
          ) {
            const index = pendingIndices[cursor++];
            active++;

            this.checkUrl(
              urls[index].url,
              isCancelled,
              (patch) => onUrlUpdate(index, patch),
              proxy,
            )
              .catch((err) =>
                onUrlUpdate(index, {
                  status: 'error',
                  errorMessage:
                    err instanceof Error ? err.message : 'Unexpected error',
                  finishedAt: new Date().toISOString(),
                }),
              )
              .finally(() => {
                active--;
                void (async () => {
                  if (await checkCancelled(isCancelled)) {
                    await cancelRemaining();
                  }
                  launchNext();
                  tryFinish();
                })();
              });
          }

          if ((await checkCancelled(isCancelled)) && active === 0) {
            await cancelRemaining();
            tryFinish();
          }
        })();
      };

      try {
        launchNext();
      } catch (err) {
        settled = true;
        reject(err);
      }
    });
  }
}
