// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LSPClient } from '../lsp-client.js';
import { FileTracker } from '../file-tracker.js';
import { withRetry } from '../utils/errors.js';

interface HoverResult {
  contents: any;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export async function getHover(
  lspClient: LSPClient,
  fileTracker: FileTracker,
  filePath: string,
  line: number,
  column: number
): Promise<string> {
  // Ensure file is opened
  const uri = await fileTracker.ensureFileOpen(filePath);

  // Make LSP request with retry
  const result: HoverResult | null = await withRetry(async () => {
    return await lspClient.request('textDocument/hover', {
      textDocument: { uri },
      position: { line, character: column }
    });
  });

  // Format results
  if (!result || !result.contents) {
    return JSON.stringify({
      found: false,
      message: 'No hover information found'
    });
  }

  const contents = extractHoverContents(result.contents);

  return JSON.stringify({
    found: true,
    contents,
    range: result.range
  }, null, 2);
}

/**
 * Extract hover contents which can be in various formats
 */
function extractHoverContents(contents: any): string {
  if (typeof contents === 'string') {
    return contents;
  }

  if (Array.isArray(contents)) {
    return contents.map(extractHoverContents).join('\n\n');
  }

  if (contents.kind === 'markdown') {
    return contents.value;
  }

  if (contents.kind === 'plaintext') {
    return contents.value;
  }

  if (contents.language && contents.value) {
    return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``;
  }

  if (contents.value) {
    return contents.value;
  }

  return JSON.stringify(contents);
}
