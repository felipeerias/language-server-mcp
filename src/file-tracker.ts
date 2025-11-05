// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { readFileSync } from 'node:fs';
import { logger } from './utils/logger.js';
import { normalizeToUri, uriToPath } from './utils/uri.js';
import { LSPClient } from './lsp-client.js';

/**
 * Tracks which files have been opened in the LSP server
 * and manages didOpen/didClose notifications
 */
export class FileTracker {
  private openFiles: Set<string> = new Set();
  private lspClient: LSPClient;

  constructor(lspClient: LSPClient) {
    this.lspClient = lspClient;
  }

  /**
   * Ensure a file is opened in the LSP server before making queries
   * Returns the normalized URI
   */
  async ensureFileOpen(filePath: string): Promise<string> {
    const uri = normalizeToUri(filePath);

    if (this.openFiles.has(uri)) {
      return uri;
    }

    await this.openFile(uri);
    return uri;
  }

  /**
   * Open a file in the LSP server via textDocument/didOpen
   */
  private async openFile(uri: string): Promise<void> {
    try {
      const fsPath = uriToPath(uri);
      const content = readFileSync(fsPath, 'utf-8');

      // Determine language ID from file extension
      const languageId = getLanguageId(fsPath);

      logger.debug('Opening file:', uri);

      this.lspClient.notify('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content
        }
      });

      this.openFiles.add(uri);
      logger.info('Opened file:', uri);
    } catch (error) {
      logger.error('Failed to open file:', uri, error);
      throw new Error(`Failed to open file ${uri}: ${error}`);
    }
  }

  /**
   * Close a file in the LSP server via textDocument/didClose
   */
  closeFile(filePath: string): void {
    const uri = normalizeToUri(filePath);

    if (!this.openFiles.has(uri)) {
      return;
    }

    logger.debug('Closing file:', uri);

    this.lspClient.notify('textDocument/didClose', {
      textDocument: { uri }
    });

    this.openFiles.delete(uri);
    logger.info('Closed file:', uri);
  }

  /**
   * Close all opened files
   */
  closeAll(): void {
    logger.info(`Closing ${this.openFiles.size} opened files`);

    for (const uri of this.openFiles) {
      this.lspClient.notify('textDocument/didClose', {
        textDocument: { uri }
      });
    }

    this.openFiles.clear();
  }

  /**
   * Get the set of currently opened file URIs
   */
  getOpenFiles(): Set<string> {
    return new Set(this.openFiles);
  }

  /**
   * Check if a file is currently opened
   */
  isFileOpen(filePath: string): boolean {
    const uri = normalizeToUri(filePath);
    return this.openFiles.has(uri);
  }
}

/**
 * Determine the LSP language ID from file extension
 */
function getLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'c':
      return 'c';
    case 'cc':
    case 'cpp':
    case 'cxx':
    case 'c++':
      return 'cpp';
    case 'h':
    case 'hh':
    case 'hpp':
    case 'hxx':
    case 'h++':
      return 'cpp'; // Headers are typically C++ in modern codebases
    case 'm':
      return 'objective-c';
    case 'mm':
      return 'objective-cpp';
    default:
      return 'cpp'; // Default to C++
  }
}
