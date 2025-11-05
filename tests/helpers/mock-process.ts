// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { ChildProcess } from 'node:child_process';

/**
 * Mock child process for testing clangd manager
 */
export class MockChildProcess extends EventEmitter {
  public stdin: Writable;
  public stdout: Readable;
  public stderr: Readable;
  public exitCode: number | null = null;
  public killed = false;

  constructor(stdin?: Writable, stdout?: Readable, stderr?: Readable) {
    super();
    this.stdin = stdin || new Writable({ write: (chunk, enc, cb) => cb() });
    this.stdout = stdout || new Readable({ read: () => {} });
    this.stderr = stderr || new Readable({ read: () => {} });
  }

  kill(signal?: string): boolean {
    this.killed = true;
    this.exitCode = null;
    this.emit('exit', null, signal || 'SIGTERM');
    return true;
  }

  simulateExit(code: number): void {
    this.exitCode = code;
    this.emit('exit', code, null);
  }

  simulateCrash(): void {
    this.exitCode = 1;
    this.emit('exit', 1, null);
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }
}

/**
 * Create a mock spawn function for testing
 */
export function createMockSpawn(mockProcess?: MockChildProcess) {
  return jest.fn().mockReturnValue(mockProcess || new MockChildProcess());
}
