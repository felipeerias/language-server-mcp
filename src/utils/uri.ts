// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

/**
 * Convert a file system path to a file:// URI
 */
export function pathToUri(filePath: string): string {
  // Ensure absolute path
  const absolutePath = resolve(filePath);
  return pathToFileURL(absolutePath).href;
}

/**
 * Convert a file:// URI to a file system path
 */
export function uriToPath(uri: string): string {
  return fileURLToPath(uri);
}

/**
 * Check if a string is a valid file:// URI
 */
export function isFileUri(uri: string): boolean {
  return uri.startsWith('file://');
}

/**
 * Normalize a path or URI to a file:// URI
 */
export function normalizeToUri(pathOrUri: string): string {
  if (isFileUri(pathOrUri)) {
    return pathOrUri;
  }
  return pathToUri(pathOrUri);
}
