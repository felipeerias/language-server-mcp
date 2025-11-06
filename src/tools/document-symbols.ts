// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LSPClient } from '../lsp-client.js';
import { FileTracker } from '../file-tracker.js';
import { withRetry } from '../utils/errors.js';
import { symbolKindNames } from '../utils/lsp-types.js';

interface DocumentSymbol {
  name: string;
  kind: number;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  selectionRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  children?: DocumentSymbol[];
}

export async function getDocumentSymbols(
  lspClient: LSPClient,
  fileTracker: FileTracker,
  filePath: string
): Promise<string> {
  // Ensure file is opened
  const uri = await fileTracker.ensureFileOpen(filePath);

  // Make LSP request with retry
  const symbols: DocumentSymbol[] = await withRetry(async () => {
    const result = await lspClient.request('textDocument/documentSymbol', {
      textDocument: { uri }
    });

    return result || [];
  });

  // Format results
  if (symbols.length === 0) {
    return JSON.stringify({
      found: false,
      message: 'No symbols found in document'
    });
  }

  const formattedSymbols = symbols.map(formatSymbol);

  return JSON.stringify({
    found: true,
    count: countSymbols(symbols),
    symbols: formattedSymbols
  }, null, 2);
}

function formatSymbol(symbol: DocumentSymbol): any {
  return {
    name: symbol.name,
    kind: symbolKindNames[symbol.kind] || `Unknown(${symbol.kind})`,
    line: symbol.range.start.line,
    column: symbol.range.start.character,
    endLine: symbol.range.end.line,
    endColumn: symbol.range.end.character,
    children: symbol.children?.map(formatSymbol)
  };
}

function countSymbols(symbols: DocumentSymbol[]): number {
  let count = symbols.length;
  for (const symbol of symbols) {
    if (symbol.children) {
      count += countSymbols(symbol.children);
    }
  }
  return count;
}
