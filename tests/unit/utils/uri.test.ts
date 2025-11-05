// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { describe, it, expect } from '@jest/globals';
import { pathToUri, uriToPath, isFileUri, normalizeToUri } from '../../../src/utils/uri.js';
import { resolve } from 'node:path';

describe('URI utilities', () => {
  describe('pathToUri', () => {
    it('should convert absolute path to file:// URI', () => {
      const path = '/absolute/path/to/file.cpp';
      const uri = pathToUri(path);
      expect(uri).toMatch(/^file:\/\//);
      expect(uri).toContain('file.cpp');
    });

    it('should convert relative path to absolute file:// URI', () => {
      const path = 'relative/path/file.cpp';
      const uri = pathToUri(path);
      expect(uri).toMatch(/^file:\/\//);
      // Should be absolute now
      expect(uriToPath(uri)).toBe(resolve(path));
    });

    it('should handle paths with spaces', () => {
      const path = '/path with spaces/file.cpp';
      const uri = pathToUri(path);
      expect(uri).toMatch(/^file:\/\//);
      expect(uri).toContain('with%20spaces');
    });

    it('should handle paths with special characters', () => {
      const path = '/path/with-special_chars.cpp';
      const uri = pathToUri(path);
      expect(uri).toMatch(/^file:\/\//);
      expect(uri).toContain('with-special_chars.cpp');
    });
  });

  describe('uriToPath', () => {
    it('should convert file:// URI to path', () => {
      const uri = 'file:///absolute/path/to/file.cpp';
      const path = uriToPath(uri);
      expect(path).toContain('file.cpp');
      expect(path).not.toContain('file://');
    });

    it('should handle URIs with encoded spaces', () => {
      const uri = 'file:///path%20with%20spaces/file.cpp';
      const path = uriToPath(uri);
      expect(path).toContain('path with spaces');
    });

    it('should roundtrip path -> URI -> path', () => {
      const originalPath = resolve('/test/path/file.cpp');
      const uri = pathToUri(originalPath);
      const resultPath = uriToPath(uri);
      expect(resultPath).toBe(originalPath);
    });
  });

  describe('isFileUri', () => {
    it('should return true for file:// URIs', () => {
      expect(isFileUri('file:///path/to/file.cpp')).toBe(true);
      expect(isFileUri('file://localhost/path/to/file.cpp')).toBe(true);
    });

    it('should return false for non-file URIs', () => {
      expect(isFileUri('http://example.com/file.cpp')).toBe(false);
      expect(isFileUri('https://example.com/file.cpp')).toBe(false);
      expect(isFileUri('/absolute/path/file.cpp')).toBe(false);
      expect(isFileUri('relative/path/file.cpp')).toBe(false);
    });
  });

  describe('normalizeToUri', () => {
    it('should keep file:// URIs unchanged', () => {
      const uri = 'file:///path/to/file.cpp';
      expect(normalizeToUri(uri)).toBe(uri);
    });

    it('should convert paths to file:// URIs', () => {
      const path = '/absolute/path/file.cpp';
      const uri = normalizeToUri(path);
      expect(uri).toMatch(/^file:\/\//);
      expect(uri).toContain('file.cpp');
    });

    it('should handle relative paths', () => {
      const path = 'relative/path/file.cpp';
      const uri = normalizeToUri(path);
      expect(uri).toMatch(/^file:\/\//);
      expect(uriToPath(uri)).toBe(resolve(path));
    });
  });
});
