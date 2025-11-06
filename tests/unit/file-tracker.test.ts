// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { FileTracker } from '../../src/file-tracker.js';
import { LSPClient } from '../../src/lsp-client.js';
import { MockWritableStream, MockReadableStream, parseLSPMessages } from '../helpers/mock-streams.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('FileTracker', () => {
  let client: LSPClient;
  let tracker: FileTracker;
  let stdin: MockWritableStream;
  let stdout: MockReadableStream;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    stdin = new MockWritableStream();
    stdout = new MockReadableStream();
    client = new LSPClient(stdin, stdout);
    tracker = new FileTracker(client);

    // Create temp test file
    testDir = join(tmpdir(), `file-tracker-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testFile = join(testDir, 'test.cpp');
    writeFileSync(testFile, '// Test C++ file\nint main() { return 0; }');
  });

  afterEach(() => {
    // Close all tracked files
    tracker.closeAll();

    // Clean up LSPClient
    client.close();

    // Clean up mock streams
    stdin.cleanup();
    stdout.cleanup();

    // Clean up test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ensureFileOpen', () => {
    it('should send didOpen notification for new file', async () => {
      await tracker.ensureFileOpen(testFile);

      const messages = parseLSPMessages(stdin.getWrittenData());
      const didOpen = messages.find((m) => m.method === 'textDocument/didOpen');

      expect(didOpen).toBeDefined();
      expect(didOpen?.params.textDocument.uri).toMatch(/^file:\/\//);
      expect(didOpen?.params.textDocument.languageId).toBe('cpp');
      expect(didOpen?.params.textDocument.version).toBe(1);
      expect(didOpen?.params.textDocument.text).toContain('int main()');
    });

    it('should not send duplicate didOpen for already-opened file', async () => {
      await tracker.ensureFileOpen(testFile);
      stdin.clear();

      await tracker.ensureFileOpen(testFile);

      const messages = parseLSPMessages(stdin.getWrittenData());
      expect(messages).toHaveLength(0);
    });

    it('should detect C language ID for .c files', async () => {
      const cFile = join(testDir, 'test.c');
      writeFileSync(cFile, 'int main() { return 0; }');

      await tracker.ensureFileOpen(cFile);

      const messages = parseLSPMessages(stdin.getWrittenData());
      const didOpen = messages.find((m) => m.method === 'textDocument/didOpen');

      expect(didOpen?.params.textDocument.languageId).toBe('c');
    });

    it('should detect cpp language ID for various C++ extensions', async () => {
      const extensions = ['cpp', 'cc', 'cxx', 'hpp', 'h'];

      for (const ext of extensions) {
        const file = join(testDir, `test.${ext}`);
        writeFileSync(file, 'int main() {}');
        const localTracker = new FileTracker(client);

        await localTracker.ensureFileOpen(file);

        const messages = parseLSPMessages(stdin.getWrittenData());
        const didOpen = messages.find((m) =>
          m.params?.textDocument?.uri?.includes(`test.${ext}`)
        );

        expect(didOpen?.params.textDocument.languageId).toBe('cpp');
        stdin.clear();
      }
    });

    it('should return normalized URI', async () => {
      const uri = await tracker.ensureFileOpen(testFile);
      expect(uri).toMatch(/^file:\/\//);
    });

    it('should throw error for non-existent file', async () => {
      const nonExistent = join(testDir, 'nonexistent.cpp');
      await expect(tracker.ensureFileOpen(nonExistent)).rejects.toThrow();
    });
  });

  describe('closeFile', () => {
    it('should send didClose notification for opened file', async () => {
      await tracker.ensureFileOpen(testFile);
      stdin.clear();

      tracker.closeFile(testFile);

      const messages = parseLSPMessages(stdin.getWrittenData());
      const didClose = messages.find((m) => m.method === 'textDocument/didClose');

      expect(didClose).toBeDefined();
      expect(didClose?.params.textDocument.uri).toMatch(/^file:\/\//);
    });

    it('should not send didClose for unopened file', () => {
      tracker.closeFile(testFile);

      const messages = parseLSPMessages(stdin.getWrittenData());
      expect(messages).toHaveLength(0);
    });

    it('should allow reopening after close', async () => {
      await tracker.ensureFileOpen(testFile);
      tracker.closeFile(testFile);
      stdin.clear();

      await tracker.ensureFileOpen(testFile);

      const messages = parseLSPMessages(stdin.getWrittenData());
      expect(messages.some((m) => m.method === 'textDocument/didOpen')).toBe(true);
    });
  });

  describe('closeAll', () => {
    it('should close all opened files', async () => {
      const file1 = join(testDir, 'file1.cpp');
      const file2 = join(testDir, 'file2.cpp');
      writeFileSync(file1, 'int x;');
      writeFileSync(file2, 'int y;');

      await tracker.ensureFileOpen(file1);
      await tracker.ensureFileOpen(file2);
      stdin.clear();

      tracker.closeAll();

      const messages = parseLSPMessages(stdin.getWrittenData());
      const didCloseMessages = messages.filter((m) => m.method === 'textDocument/didClose');

      expect(didCloseMessages).toHaveLength(2);
    });

    it('should clear internal tracking after closeAll', async () => {
      await tracker.ensureFileOpen(testFile);
      tracker.closeAll();

      expect(tracker.isFileOpen(testFile)).toBe(false);
    });
  });

  describe('isFileOpen', () => {
    it('should return true for opened files', async () => {
      await tracker.ensureFileOpen(testFile);
      expect(tracker.isFileOpen(testFile)).toBe(true);
    });

    it('should return false for unopened files', () => {
      expect(tracker.isFileOpen(testFile)).toBe(false);
    });

    it('should return false after closing file', async () => {
      await tracker.ensureFileOpen(testFile);
      tracker.closeFile(testFile);
      expect(tracker.isFileOpen(testFile)).toBe(false);
    });
  });

  describe('getOpenFiles', () => {
    it('should return set of opened file URIs', async () => {
      const file1 = join(testDir, 'file1.cpp');
      const file2 = join(testDir, 'file2.cpp');
      writeFileSync(file1, 'int x;');
      writeFileSync(file2, 'int y;');

      await tracker.ensureFileOpen(file1);
      await tracker.ensureFileOpen(file2);

      const openFiles = tracker.getOpenFiles();
      expect(openFiles.size).toBe(2);
      expect([...openFiles].every((uri) => uri.startsWith('file://'))).toBe(true);
    });

    it('should return empty set when no files open', () => {
      const openFiles = tracker.getOpenFiles();
      expect(openFiles.size).toBe(0);
    });
  });
});
