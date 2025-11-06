// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LSPClient } from '../lsp-client.js';
import { FileTracker } from '../file-tracker.js';
import { uriToPath } from '../utils/uri.js';
import { withRetry } from '../utils/errors.js';
import { Location, normalizeLocationResult } from '../utils/lsp-types.js';

export async function findDefinition(
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
    const result = await lspClient.request('textDocument/definition', {
      textDocument: { uri },
      position: { line, character: column }
    });

    return normalizeLocationResult(result);
  });

  // Format results
  if (locations.length === 0) {
    return JSON.stringify({
      found: false,
      message: 'No definition found'
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
