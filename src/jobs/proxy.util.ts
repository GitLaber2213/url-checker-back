import { BadRequestException } from '@nestjs/common';

const ALLOWED_PROTOCOLS = new Set([
  'socks5:',
  'socks4:',
  'socks4a:',
  'socks5h:',
  'http:',
  'https:',
]);

export function normalizeProxy(proxy: unknown): string | undefined {
  if (proxy == null || proxy === '') {
    return undefined;
  }

  const trimmed = String(proxy).trim();
  if (!trimmed) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException(
      'Invalid proxy URL. Example: socks5://user:pass@host:port',
    );
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BadRequestException(
      `Unsupported proxy protocol "${url.protocol}". Use socks5, socks4, http or https`,
    );
  }

  if (!url.hostname || !url.port) {
    throw new BadRequestException('Proxy must include host and port');
  }

  return trimmed;
}

/** Маскирует пароль в proxy URL для ответов API */
export function maskProxy(proxy: string | null | undefined): string | null {
  if (!proxy) {
    return null;
  }

  try {
    const url = new URL(proxy);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return null;
  }
}
