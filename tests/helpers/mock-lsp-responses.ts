// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Mock LSP responses for testing
 */

export const mockInitializeResult = {
  capabilities: {
    textDocumentSync: 1,
    definitionProvider: true,
    referencesProvider: true,
    hoverProvider: true,
    implementationProvider: true,
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
  },
  serverInfo: {
    name: 'clangd',
    version: '15.0.0',
  },
};

export function createMockLocation(filePath: string, line: number, column: number) {
  return {
    uri: `file://${filePath}`,
    range: {
      start: { line, character: column },
      end: { line, character: column + 10 },
    },
  };
}

export const mockDefinitionResponse = [
  createMockLocation('/path/to/file.cpp', 42, 10),
];

export const mockReferencesResponse = [
  createMockLocation('/path/to/file1.cpp', 10, 5),
  createMockLocation('/path/to/file2.cpp', 20, 15),
  createMockLocation('/path/to/file3.cpp', 30, 25),
];

export const mockHoverResponse = {
  contents: {
    kind: 'markdown',
    value: '```cpp\nint myFunction(int x)\n```\n\nDoes something useful.',
  },
  range: {
    start: { line: 10, character: 5 },
    end: { line: 10, character: 15 },
  },
};

export const mockWorkspaceSymbolsResponse = [
  {
    name: 'MyClass',
    kind: 5, // Class
    location: createMockLocation('/path/to/class.h', 10, 0),
  },
  {
    name: 'myFunction',
    kind: 12, // Function
    location: createMockLocation('/path/to/function.cpp', 50, 0),
  },
];

export const mockImplementationsResponse = [
  createMockLocation('/path/to/impl1.cpp', 100, 0),
  createMockLocation('/path/to/impl2.cpp', 200, 0),
];

export const mockDocumentSymbolsResponse = [
  {
    name: 'MyClass',
    kind: 5, // Class
    range: {
      start: { line: 10, character: 0 },
      end: { line: 50, character: 2 },
    },
    selectionRange: {
      start: { line: 10, character: 6 },
      end: { line: 10, character: 13 },
    },
    children: [
      {
        name: 'method1',
        kind: 6, // Method
        range: {
          start: { line: 20, character: 2 },
          end: { line: 25, character: 3 },
        },
        selectionRange: {
          start: { line: 20, character: 7 },
          end: { line: 20, character: 14 },
        },
      },
    ],
  },
];

export function createMockLSPError(code: number, message: string) {
  return {
    code,
    message,
    data: null,
  };
}

export const mockLSPInternalError = createMockLSPError(-32603, 'Internal error');
export const mockLSPParseError = createMockLSPError(-32700, 'Parse error');
