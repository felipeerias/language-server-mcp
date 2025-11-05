// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { logger } from './utils/logger.js';

export interface ClangdConfig {
  clangdPath: string;
  clangdArgs: string[];
  projectRoot: string;
  compileCommandsPath?: string;
  isChromiumProject: boolean;
}

/**
 * Detect project configuration and generate appropriate clangd settings
 */
export function detectConfiguration(): ClangdConfig {
  // Get project root from environment or use cwd
  const projectRoot = resolve(process.env.PROJECT_ROOT || process.cwd());
  logger.info('Project root:', projectRoot);

  // Find clangd binary
  const clangdPath = process.env.CLANGD_PATH || 'clangd';
  logger.info('Clangd path:', clangdPath);

  // Check if this is a Chromium project
  const isChromiumProject = existsSync(join(projectRoot, '.gclient'));
  if (isChromiumProject) {
    logger.info('Detected Chromium project');
  }

  // Find compile_commands.json
  const compileCommandsPath = findCompileCommands(projectRoot);
  if (compileCommandsPath) {
    logger.info('Found compile_commands.json at:', compileCommandsPath);
  } else {
    logger.warn('compile_commands.json not found - clangd may not work correctly');
  }

  // Generate clangd arguments
  const clangdArgs = generateClangdArgs(isChromiumProject, compileCommandsPath);
  logger.info('Clangd arguments:', clangdArgs.join(' '));

  return {
    clangdPath,
    clangdArgs,
    projectRoot,
    compileCommandsPath,
    isChromiumProject
  };
}

/**
 * Search for compile_commands.json in standard locations
 */
function findCompileCommands(projectRoot: string): string | undefined {
  // Check explicit environment variable first
  if (process.env.COMPILE_COMMANDS_DIR) {
    const explicitPath = resolve(process.env.COMPILE_COMMANDS_DIR, 'compile_commands.json');
    if (existsSync(explicitPath)) {
      return explicitPath;
    }
  }

  // Search standard locations
  const searchPaths = [
    'compile_commands.json',
    'build/compile_commands.json',
    'out/Default/compile_commands.json',
    'out/Release/compile_commands.json',
    'out/Debug/compile_commands.json',
    '.build/compile_commands.json'
  ];

  for (const searchPath of searchPaths) {
    const fullPath = join(projectRoot, searchPath);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return undefined;
}

/**
 * Generate appropriate clangd arguments based on project type
 */
function generateClangdArgs(isChromiumProject: boolean, compileCommandsPath?: string): string[] {
  const args: string[] = [];

  // Parse additional args from environment
  if (process.env.CLANGD_ARGS) {
    args.push(...process.env.CLANGD_ARGS.split(' ').filter(arg => arg.length > 0));
  }

  // Add compile commands path if found
  if (compileCommandsPath) {
    args.push(`--compile-commands-dir=${compileCommandsPath.replace('/compile_commands.json', '')}`);
  }

  // Disable background indexing by default for MCP server use case
  // MCP servers make sporadic queries, not continuous editing, so on-demand
  // indexing (via didOpen) is more efficient. Users can override via CLANGD_ARGS.
  if (!args.some(arg => arg.startsWith('--background-index'))) {
    args.push('--background-index=false');
  }

  // For Chromium projects, suggest remote index server
  if (isChromiumProject) {
    if (!args.some(arg => arg.startsWith('--remote-index-address'))) {
      logger.info('Consider setting up a remote index server for better performance on Chromium');
    }
  }

  // Limit results for all queries
  if (!args.some(arg => arg.startsWith('--limit-references'))) {
    args.push('--limit-references=1000');
  }

  if (!args.some(arg => arg.startsWith('--limit-results'))) {
    args.push('--limit-results=1000');
  }

  // Always enable malloc trim for long-running instances
  if (!args.some(arg => arg.includes('malloc-trim'))) {
    args.push('--malloc-trim');
  }

  // Improve performance
  if (!args.some(arg => arg.startsWith('--pch-storage'))) {
    args.push('--pch-storage=memory');
  }

  if (!args.some(arg => arg.startsWith('--clang-tidy'))) {
    args.push('--clang-tidy=false'); // Disable for performance
  }

  // Log level
  if (!args.some(arg => arg.startsWith('--log'))) {
    const logLevel = process.env.CLANGD_LOG_LEVEL || 'error';
    args.push(`--log=${logLevel}`);
  }

  return args;
}
