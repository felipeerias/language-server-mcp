// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LSPClient } from '../lsp-client.js';
import { uriToPath } from '../utils/uri.js';
import { withRetry } from '../utils/errors.js';

interface SymbolInformation {
  name: string;
  kind: number;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  containerName?: string;
}

const symbolKindNames: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter'
};

export async function workspaceSymbolSearch(
  lspClient: LSPClient,
  query: string,
  limit: number = 100
): Promise<string> {
  // Make LSP request with retry
  const symbols: SymbolInformation[] = await withRetry(async () => {
    const result = await lspClient.request('workspace/symbol', {
      query
    });

    return result || [];
  });

  // Format results
  if (symbols.length === 0) {
    return JSON.stringify({
      found: false,
      message: `No symbols found matching '${query}'`
    });
  }

  // Apply limit
  const limitedSymbols = symbols.slice(0, limit);

  const formattedSymbols = limitedSymbols.map(sym => ({
    name: sym.name,
    kind: symbolKindNames[sym.kind] || `Unknown(${sym.kind})`,
    file: uriToPath(sym.location.uri),
    line: sym.location.range.start.line,
    column: sym.location.range.start.character,
    container: sym.containerName,
    uri: sym.location.uri
  }));

  return JSON.stringify({
    found: true,
    count: symbols.length,
    returned: formattedSymbols.length,
    truncated: symbols.length > limit,
    symbols: formattedSymbols
  }, null, 2);
}
