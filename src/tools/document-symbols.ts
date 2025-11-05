// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { LSPClient } from '../lsp-client.js';
import { FileTracker } from '../file-tracker.js';
import { withRetry } from '../utils/errors.js';

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
