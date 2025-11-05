// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('Logger utilities', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    // Reset LOG_LEVEL
    delete process.env.LOG_LEVEL;
  });

  it('should log at appropriate levels', async () => {
    // Re-import logger to pick up env changes
    process.env.LOG_LEVEL = 'DEBUG';
    const { logger } = await import('../../../src/utils/logger.js');

    logger.error('error message');
    logger.warn('warn message');
    logger.info('info message');
    logger.debug('debug message');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      expect.stringContaining('error message')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARN'),
      expect.stringContaining('warn message')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      expect.stringContaining('info message')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEBUG'),
      expect.stringContaining('debug message')
    );
  });

  it('should respect log level filtering', async () => {
    process.env.LOG_LEVEL = 'WARN';
    // Need to reload module to pick up new env
    jest.resetModules();
    const { logger } = await import('../../../src/utils/logger.js');

    logger.error('error message');
    logger.warn('warn message');
    logger.info('info message');
    logger.debug('debug message');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      expect.stringContaining('error message')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARN'),
      expect.stringContaining('warn message')
    );
    // INFO and DEBUG should be filtered out
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('INFO')
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('DEBUG')
    );
  });

  it('should handle multiple arguments', async () => {
    process.env.LOG_LEVEL = 'INFO';
    jest.resetModules();
    const { logger } = await import('../../../src/utils/logger.js');

    const obj = { foo: 'bar' };
    logger.info('Message with', 'multiple', 'args', obj);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      expect.stringContaining('Message with'),
      'multiple',
      'args',
      obj
    );
  });
});
