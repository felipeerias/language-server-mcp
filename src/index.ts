#!/usr/bin/env node

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './utils/logger.js';
import { detectConfiguration } from './config-detector.js';
import { ClangdManager } from './clangd-manager.js';
import { FileTracker } from './file-tracker.js';

import { findDefinition } from './tools/find-definition.js';
import { findReferences } from './tools/find-references.js';
import { getHover } from './tools/get-hover.js';
import { workspaceSymbolSearch } from './tools/workspace-symbol.js';
import { findImplementations } from './tools/find-implementations.js';
import { getDocumentSymbols } from './tools/document-symbols.js';

// Global state
let clangdManager: ClangdManager | null = null;
let fileTracker: FileTracker | null = null;

/**
 * Initialize clangd (lazy initialization on first query)
 */
async function ensureClangdInitialized(): Promise<void> {
  if (clangdManager && clangdManager.isReady()) {
    return;
  }

  logger.info('Initializing clangd...');

  const config = detectConfiguration();
  clangdManager = new ClangdManager(config);
  await clangdManager.start();

  fileTracker = new FileTracker(clangdManager.getClient());

  logger.info('Clangd initialization complete');
}

/**
 * Main server setup
 */
async function main() {
  logger.info('Starting clangd MCP server');

  const server = new Server(
    {
      name: 'clangd-mcp-server',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'find_definition',
          description: 'Find the definition of a symbol at a given location in a file',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the source file'
              },
              line: {
                type: 'number',
                description: 'Line number (0-indexed)'
              },
              column: {
                type: 'number',
                description: 'Column number (0-indexed)'
              }
            },
            required: ['file_path', 'line', 'column']
          }
        },
        {
          name: 'find_references',
          description: 'Find all references to a symbol at a given location',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the source file'
              },
              line: {
                type: 'number',
                description: 'Line number (0-indexed)'
              },
              column: {
                type: 'number',
                description: 'Column number (0-indexed)'
              },
              include_declaration: {
                type: 'boolean',
                description: 'Include the declaration in the results (default: true)',
                default: true
              }
            },
            required: ['file_path', 'line', 'column']
          }
        },
        {
          name: 'get_hover',
          description: 'Get hover information (type, documentation) for a symbol at a given location',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the source file'
              },
              line: {
                type: 'number',
                description: 'Line number (0-indexed)'
              },
              column: {
                type: 'number',
                description: 'Column number (0-indexed)'
              }
            },
            required: ['file_path', 'line', 'column']
          }
        },
        {
          name: 'workspace_symbol_search',
          description: 'Search for symbols across the entire workspace',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for symbol names'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 100)',
                default: 100
              }
            },
            required: ['query']
          }
        },
        {
          name: 'find_implementations',
          description: 'Find implementations of an interface or virtual method at a given location',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the source file'
              },
              line: {
                type: 'number',
                description: 'Line number (0-indexed)'
              },
              column: {
                type: 'number',
                description: 'Column number (0-indexed)'
              }
            },
            required: ['file_path', 'line', 'column']
          }
        },
        {
          name: 'get_document_symbols',
          description: 'Get a hierarchical list of all symbols in a document',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the source file'
              }
            },
            required: ['file_path']
          }
        }
      ]
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      // Initialize clangd on first tool call
      await ensureClangdInitialized();

      if (!clangdManager || !fileTracker) {
        throw new Error('Clangd not initialized');
      }

      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error('Missing arguments for tool call');
      }

      switch (name) {
        case 'find_definition': {
          const result = await findDefinition(
            clangdManager.getClient(),
            fileTracker,
            args.file_path as string,
            args.line as number,
            args.column as number
          );
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        case 'find_references': {
          const result = await findReferences(
            clangdManager.getClient(),
            fileTracker,
            args.file_path as string,
            args.line as number,
            args.column as number,
            args.include_declaration !== false
          );
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        case 'get_hover': {
          const result = await getHover(
            clangdManager.getClient(),
            fileTracker,
            args.file_path as string,
            args.line as number,
            args.column as number
          );
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        case 'workspace_symbol_search': {
          const result = await workspaceSymbolSearch(
            clangdManager.getClient(),
            args.query as string,
            (args.limit as number) || 100
          );
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        case 'find_implementations': {
          const result = await findImplementations(
            clangdManager.getClient(),
            fileTracker,
            args.file_path as string,
            args.line as number,
            args.column as number
          );
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        case 'get_document_symbols': {
          const result = await getDocumentSymbols(
            clangdManager.getClient(),
            fileTracker,
            args.file_path as string
          );
          return {
            content: [{ type: 'text', text: result }]
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error('Tool call failed:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: true,
              message: error instanceof Error ? error.message : String(error)
            })
          }
        ],
        isError: true
      };
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    if (fileTracker) {
      fileTracker.closeAll();
    }
    if (clangdManager) {
      await clangdManager.shutdown();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    if (fileTracker) {
      fileTracker.closeAll();
    }
    if (clangdManager) {
      await clangdManager.shutdown();
    }
    process.exit(0);
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Clangd MCP server running on stdio');
}

// Run the server
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
