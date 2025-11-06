// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  TimeoutError,
  ClangdError,
  LSPError,
  withTimeout,
  withRetry,
} from '../../../src/utils/errors.js';

describe('Error utilities', () => {
  afterEach(() => {
    // Clean up any pending timers
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Custom error classes', () => {
    it('should create TimeoutError with correct properties', () => {
      const error = new TimeoutError('Operation timed out');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Operation timed out');
    });

    it('should create ClangdError with code', () => {
      const error = new ClangdError('Clangd failed', 123);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ClangdError);
      expect(error.name).toBe('ClangdError');
      expect(error.message).toBe('Clangd failed');
      expect(error.code).toBe(123);
    });

    it('should create LSPError with code and data', () => {
      const data = { info: 'test' };
      const error = new LSPError('LSP failed', -32603, data);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LSPError);
      expect(error.name).toBe('LSPError');
      expect(error.message).toBe('LSP failed');
      expect(error.code).toBe(-32603);
      expect(error.data).toEqual(data);
    });
  });

  describe('withTimeout', () => {
    it('should resolve if promise completes before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000, 'Should not timeout');
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError if promise exceeds timeout', async () => {
      const promise = new Promise((resolve) => setTimeout(resolve, 200));
      await expect(
        withTimeout(promise, 50, 'Custom timeout message')
      ).rejects.toThrow(TimeoutError);
      await expect(
        withTimeout(new Promise((resolve) => setTimeout(resolve, 200)), 50, 'Custom timeout message')
      ).rejects.toThrow('Custom timeout message');
    });

    it('should reject with original error if promise rejects before timeout', async () => {
      const promise = Promise.reject(new Error('Original error'));
      await expect(
        withTimeout(promise, 1000, 'Timeout message')
      ).rejects.toThrow('Original error');
    });

    it('should use default timeout message if not provided', async () => {
      const promise = new Promise((resolve) => setTimeout(resolve, 200));
      await expect(withTimeout(promise, 50)).rejects.toThrow('Operation timed out');
    });
  });

  describe('withRetry', () => {
    it('should return result on first successful attempt', async () => {
      const fn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient TimeoutError', async () => {
      const fn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new TimeoutError('Timeout'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on transient LSPError (-32603)', async () => {
      const fn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new LSPError('Internal error', -32603))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on transient LSPError (-32700)', async () => {
      const fn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new LSPError('Parse error', -32700))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-transient errors', async () => {
      const error = new Error('Non-transient error');
      const fn = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);

      await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('Non-transient error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not retry on non-transient LSPError', async () => {
      const error = new LSPError('Method not found', -32601);
      const fn = jest.fn<() => Promise<unknown>>().mockRejectedValue(error);

      await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(LSPError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should respect maxAttempts limit', async () => {
      const fn = jest.fn<() => Promise<unknown>>().mockRejectedValue(new TimeoutError('Timeout'));

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })
      ).rejects.toThrow(TimeoutError);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff', async () => {
      const fn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new TimeoutError('Timeout 1'))
        .mockRejectedValueOnce(new TimeoutError('Timeout 2'))
        .mockResolvedValue('success');

      const start = Date.now();
      await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 1000,
      });
      const duration = Date.now() - start;

      // Should wait ~10ms + ~20ms = ~30ms (allow for timing variance)
      expect(duration).toBeGreaterThanOrEqual(25);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelayMs', async () => {
      const fn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new TimeoutError('Timeout 1'))
        .mockRejectedValueOnce(new TimeoutError('Timeout 2'))
        .mockResolvedValue('success');

      await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        maxDelayMs: 15,
      });

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use custom shouldRetry function', async () => {
      const customError = new Error('Custom retryable error');
      const fn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(customError)
        .mockResolvedValue('success');

      const shouldRetry = (error: any) => error.message.includes('retryable');

      const result = await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        shouldRetry,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
