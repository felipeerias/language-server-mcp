// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { logger } from './logger.js';

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ClangdError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = 'ClangdError';
  }
}

export class LSPError extends Error {
  constructor(message: string, public code?: number, public data?: any) {
    super(message);
    this.name = 'LSPError';
  }
}

/**
 * Execute a function with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(timeoutMessage)), timeoutMs)
    )
  ]);
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    shouldRetry = (error) => isTransientError(error)
  } = options;

  let lastError: any;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      logger.warn(`Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms`, error);

      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 2, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Check if an error is transient and should be retried
 */
function isTransientError(error: any): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }

  if (error instanceof LSPError) {
    // Retry on server busy or parse errors
    return error.code === -32603 || // InternalError
           error.code === -32700;   // ParseError
  }

  return false;
}
