// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LSPClient } from '../lsp-client.js';
import { FileTracker } from '../file-tracker.js';
import { uriToPath } from '../utils/uri.js';
import { withRetry } from '../utils/errors.js';

interface Position {
  line: number;
  character: number;
}

interface Location {
  uri: string;
  range: {
    start: Position;
    end: Position;
  };
}

export async function findImplementations(
  lspClient: LSPClient,
  fileTracker: FileTracker,
  filePath: string,
  line: number,
  column: number
): Promise<string> {
  // Ensure file is opened
  const uri = await fileTracker.ensureFileOpen(filePath);

  // Make LSP request with retry
  const locations = await withRetry(async () => {
    const result = await lspClient.request('textDocument/implementation', {
      textDocument: { uri },
      position: { line, character: column }
    });

    return normalizeLocationResult(result);
  });

  // Format results
  if (locations.length === 0) {
    return JSON.stringify({
      found: false,
      message: 'No implementations found'
    });
  }

  const formattedLocations = locations.map(loc => ({
    file: uriToPath(loc.uri),
    line: loc.range.start.line,
    column: loc.range.start.character,
    uri: loc.uri
  }));

  return JSON.stringify({
    found: true,
    count: formattedLocations.length,
    locations: formattedLocations
  }, null, 2);
}

/**
 * Normalize LSP location result which can be Location | Location[] | null
 */
function normalizeLocationResult(result: any): Location[] {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  return [result];
}
