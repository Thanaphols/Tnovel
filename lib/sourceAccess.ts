import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ErrorCode } from './enums';

export class SourceAccessError extends Error {
  errorCode: ErrorCode;
  statusCode?: number;
  isRetryable: boolean;

  constructor(message: string, errorCode: ErrorCode, statusCode?: number, isRetryable: boolean = false) {
    super(message);
    this.name = 'SourceAccessError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

// Domain-level rate limiter & concurrency tracker
interface DomainQueueState {
  activeCount: number;
  lastRequestTime: number;
}

const domainStates = new Map<string, DomainQueueState>();
const MAX_CONCURRENCY_PER_DOMAIN = 2;
const MIN_REQUEST_INTERVAL_MS = 1000; // 1s between requests to same domain

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return 'default';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireDomainSlot(domain: string): Promise<void> {
  while (true) {
    let state = domainStates.get(domain);
    if (!state) {
      state = { activeCount: 0, lastRequestTime: 0 };
      domainStates.set(domain, state);
    }

    if (state.activeCount < MAX_CONCURRENCY_PER_DOMAIN) {
      const timeSinceLast = Date.now() - state.lastRequestTime;
      if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
        await delay(MIN_REQUEST_INTERVAL_MS - timeSinceLast);
      }
      state.activeCount++;
      state.lastRequestTime = Date.now();
      return;
    }

    // Wait 200ms before checking again
    await delay(200);
  }
}

export function releaseDomainSlot(domain: string): void {
  const state = domainStates.get(domain);
  if (state && state.activeCount > 0) {
    state.activeCount--;
    state.lastRequestTime = Date.now();
  }
}

/**
 * Execute an HTTP request conforming to Source Access Policy:
 * - Domain concurrency cap (max 2)
 * - Minimum request interval (1s)
 * - Immediate abort on 403, 429, Cloudflare challenge (no retry loops)
 * - Exponential backoff on transient network timeouts
 */
export async function executeSourceFetch(
  url: string,
  config: AxiosRequestConfig = {},
  maxAttempts: number = 2
): Promise<AxiosResponse<any>> {
  const domain = getDomain(url);
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    await acquireDomainSlot(domain);

    try {
      const response = await axios({
        url,
        timeout: 8000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
          ...(config.headers || {}),
        },
        ...config,
      });

      // Check if response HTML contains Cloudflare challenge markers
      if (typeof response.data === 'string') {
        const lowerData = response.data.toLowerCase();
        if (
          lowerData.includes('cf-browser-verification') ||
          lowerData.includes('challenge-platform') ||
          lowerData.includes('just a moment...') ||
          lowerData.includes('turnstile')
        ) {
          throw new SourceAccessError(
            'เว็บต้นทางเปิดระบบป้องกัน Cloudflare Challenge กรุณาวางเนื้อหาด้วยตนเอง',
            ErrorCode.SOURCE_BLOCKED_OR_CHALLENGE,
            403,
            false
          );
        }
      }

      return response;
    } catch (err: any) {
      const status = err.response?.status;

      // Handle 403 / 429 - Early abort, do NOT retry
      if (status === 403) {
        throw new SourceAccessError(
          'เว็บต้นทางปฏิเสธการเข้าถึง (HTTP 403 Forbidden)',
          ErrorCode.SOURCE_403_FORBIDDEN,
          403,
          false
        );
      }
      if (status === 429) {
        throw new SourceAccessError(
          'เว็บต้นทางจำกัดอัตราการเข้าถึง (HTTP 429 Too Many Requests)',
          ErrorCode.SOURCE_429_RATE_LIMIT,
          429,
          false
        );
      }

      if (err instanceof SourceAccessError) {
        throw err;
      }

      // Check for timeout
      const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
      if (isTimeout && attempt >= maxAttempts) {
        throw new SourceAccessError(
          'การเชื่อมต่อไปยังเว็บต้นทางหมดเวลา (Timeout)',
          ErrorCode.SOURCE_TIMEOUT,
          408,
          false
        );
      }

      // If retryable network error and attempts remain
      if (attempt < maxAttempts) {
        const backoffMs = attempt * 1500;
        await delay(backoffMs);
      } else {
        throw new SourceAccessError(
          err.message || 'ไม่สามารถดึงข้อมูลจากเว็บต้นทางได้',
          ErrorCode.SOURCE_PARSE_ERROR,
          status,
          false
        );
      }
    } finally {
      releaseDomainSlot(domain);
    }
  }

  throw new SourceAccessError(
    'ดึงข้อมูลจากเว็บต้นทางไม่สำเร็จหลังลองซ้ำ',
    ErrorCode.SOURCE_TIMEOUT,
    undefined,
    false
  );
}
