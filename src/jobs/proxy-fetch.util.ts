import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

export interface HeadResult {
  status: number;
  statusText: string;
}

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*',
};

function createAgents(proxyUrl: string) {
  const protocol = new URL(proxyUrl).protocol;

  if (
    protocol === 'socks5:' ||
    protocol === 'socks4:' ||
    protocol === 'socks4a:' ||
    protocol === 'socks5h:'
  ) {
    const agent = new SocksProxyAgent(proxyUrl);
    return { httpAgent: agent, httpsAgent: agent, proxy: false as const };
  }

  return {
    httpAgent: new HttpProxyAgent(proxyUrl),
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false as const,
  };
}

function formatRequestError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError;
    const code = axiosErr.code ? ` [${axiosErr.code}]` : '';
    const detail = axiosErr.message || 'Request failed';
    const status = axiosErr.response?.status;
    if (status) {
      return new Error(`HTTP ${status}${code}: ${detail}`);
    }
    return new Error(`${detail}${code}`);
  }

  if (err instanceof Error) {
    return err;
  }

  return new Error('Unknown request error');
}

function baseConfig(
  signal: AbortSignal,
  proxy?: string,
): AxiosRequestConfig {
  return {
    timeout: 15_000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: DEFAULT_HEADERS,
    signal,
    ...(proxy ? createAgents(proxy) : {}),
  };
}

async function readStatus(
  config: AxiosRequestConfig,
  url: string,
  method: 'HEAD' | 'GET',
): Promise<HeadResult> {
  if (method === 'HEAD') {
    const response = await axios.head(url, config);
    return {
      status: response.status,
      statusText: response.statusText,
    };
  }

  const response = await axios.get(url, {
    ...config,
    responseType: 'stream',
  });

  const stream = response.data as NodeJS.ReadableStream & {
    destroy?: () => void;
  };
  stream.destroy?.();

  return {
    status: response.status,
    statusText: response.statusText,
  };
}

/** HEAD-запрос; при ошибке или 405/501 — fallback на GET (только статус). */
export async function headWithProxy(
  url: string,
  signal: AbortSignal,
  proxy?: string,
): Promise<HeadResult> {
  const config = baseConfig(signal, proxy);

  try {
    const head = await readStatus(config, url, 'HEAD');

    if (head.status === 405 || head.status === 501) {
      return readStatus(config, url, 'GET');
    }

    return head;
  } catch (headError) {
    try {
      return await readStatus(config, url, 'GET');
    } catch (getError) {
      throw formatRequestError(getError ?? headError);
    }
  }
}
