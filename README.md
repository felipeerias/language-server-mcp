# Clangd MCP Server

An experimental [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that enables Claude Code to connect to clangd LSP for enhanced C++ code intelligence on large codebases.

## Overview

This MCP server bridges Claude Code with clangd (the Language Server Protocol implementation for C/C++), enabling rich code navigation capabilities without requiring full codebase indexing by Claude. It's designed to work efficiently with Chromium-scale codebases.

## Features

- **Code Navigation Tools**:
  - `find_definition` - Jump to symbol definitions
  - `find_references` - Find all references to a symbol
  - `get_hover` - Get type information and documentation
  - `workspace_symbol_search` - Search symbols across the workspace
  - `find_implementations` - Find interface/virtual method implementations
  - `get_document_symbols` - Get hierarchical symbol tree for a file

- **Robust Architecture**:
  - Long-lived clangd process with automatic crash recovery
  - Lazy initialization (clangd starts on first query)
  - Configurable for different project sizes (Chromium vs normal projects)
  - Proper LSP lifecycle management (didOpen/didClose)
  - Timeout and retry handling with exponential backoff

## Requirements

- Node.js >= 18.0.0
- clangd (install via your package manager or LLVM)
- A C++ project with `compile_commands.json`

### Installing clangd

**Ubuntu/Debian:**
```bash
sudo apt install clangd
```

**macOS:**
```bash
brew install llvm
# clangd will be at /opt/homebrew/opt/llvm/bin/clangd
```

**From LLVM releases:**
Download from https://github.com/clangd/clangd/releases

## Installation

### Option 1: Install from npm (when published)

```bash
npm install -g clangd-mcp-server
```

### Option 2: Install from source

```bash
git clone https://github.com/yourusername/language-server-mcp.git
cd language-server-mcp
npm install
npm run build
npm link
```

## Configuration

### Generating compile_commands.json

Clangd requires a `compile_commands.json` file to understand your project's build configuration.

**CMake projects:**
```bash
cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON /path/to/source
```

**Chromium/GN projects:**
```bash
gn gen out/Default
# compile_commands.json will be in out/Default/
```

**Other build systems:**
- See [Bear](https://github.com/rizsotto/Bear) for capturing compile commands

### Claude Code Configuration

Add the MCP server to your Claude Code configuration file (`~/.claude.json` or project-specific `.claude.json`):

```json
{
  "mcpServers": {
    "clangd": {
      "command": "clangd-mcp-server",
      "env": {
        "PROJECT_ROOT": "/path/to/your/project",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Environment Variables

Configure the server behavior using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECT_ROOT` | Project workspace root directory | Current working directory |
| `COMPILE_COMMANDS_DIR` | Explicit path to directory containing compile_commands.json | Auto-detected |
| `CLANGD_PATH` | Path to clangd binary | `clangd` (from PATH) |
| `CLANGD_ARGS` | Additional clangd arguments | Auto-configured based on project |
| `CLANGD_LOG_LEVEL` | Clangd's internal log level | `error` |
| `LOG_LEVEL` | MCP server log level (ERROR, WARN, INFO, DEBUG) | `INFO` |

### Example Configurations

**Chromium project:**
```json
{
  "mcpServers": {
    "clangd": {
      "command": "clangd-mcp-server",
      "env": {
        "PROJECT_ROOT": "/home/user/chromium/src",
        "COMPILE_COMMANDS_DIR": "/home/user/chromium/src/out/Default",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Custom clangd with additional args:**
```json
{
  "mcpServers": {
    "clangd": {
      "command": "clangd-mcp-server",
      "env": {
        "PROJECT_ROOT": "/path/to/project",
        "CLANGD_PATH": "/opt/homebrew/opt/llvm/bin/clangd",
        "CLANGD_ARGS": "--header-insertion=never --completion-style=detailed"
      }
    }
  }
}
```

## Usage

Once configured, Claude Code can use the following tools:

### Find Definition

```
Find the definition of the symbol at line 42, column 10 in src/foo.cpp
```

Claude will call:
```json
{
  "tool": "find_definition",
  "arguments": {
    "file_path": "/absolute/path/to/src/foo.cpp",
    "line": 41,
    "column": 10
  }
}
```

Note: Line and column numbers are 0-indexed in LSP.

### Find References

```
Find all references to the function at line 100, column 5 in include/bar.h
```

### Get Hover Information

```
What is the type of the variable at line 200, column 15 in src/baz.cpp?
```

### Search Workspace Symbols

```
Find all symbols matching "HttpRequest"
```

### Find Implementations

```
Find implementations of the virtual method at line 50, column 8 in interface.h
```

### Get Document Symbols

```
Show me all symbols in src/main.cpp
```

## Performance Considerations

### Background Indexing (Disabled by Default)

By default, this MCP server **disables background indexing** (`--background-index=false`) for all projects.

**Why?** MCP servers make sporadic queries rather than continuous editing sessions. On-demand indexing (when files are opened via `didOpen`) is more efficient for this use case and:
- Uses significantly less memory (GBs less on large codebases)
- Reduces CPU usage (no continuous background indexing)
- Provides faster startup
- Still indexes files as they're queried

**Implications:**
- `workspace_symbol_search` only finds symbols in already-opened/indexed files
- First query on a file may take longer (5-15s) while clangd parses it
- Subsequent queries on the same file are fast (1-5s)

**To enable background indexing** (if you want workspace-wide symbol search):

```json
{
  "mcpServers": {
    "clangd": {
      "command": "clangd-mcp-server",
      "env": {
        "PROJECT_ROOT": "/path/to/project",
        "CLANGD_ARGS": "--background-index --limit-references=1000 --limit-results=1000"
      }
    }
  }
}
```

Note: Background indexing can take hours on large codebases and use significant memory.

### Chromium Projects

For Chromium-scale projects, consider setting up a [remote index server](https://clangd.llvm.org/design/remote-index) for better performance with workspace-wide symbol search.

### Expected Performance

- **Warm files** (already indexed): 1-5 seconds
- **Cold files** (first query): 5-15 seconds
- **Startup time**: < 5 seconds for MCP server
- **Memory**: < 500MB for MCP server (clangd uses significantly less without background indexing)

## Troubleshooting

### Clangd not found

```
Error: Failed to start clangd: spawn clangd ENOENT
```

**Solution:** Install clangd or set `CLANGD_PATH` environment variable.

### compile_commands.json not found

```
Warning: compile_commands.json not found - clangd may not work correctly
```

**Solution:** Generate `compile_commands.json` for your project (see Configuration section).

### Queries timing out

```
Error: LSP request 'textDocument/definition' timed out after 30000ms
```

**Possible causes:**
- File not in compile_commands.json
- Clangd indexing in progress (wait and retry)
- Large file with complex templates

**Solutions:**
- Increase timeout in code (not currently configurable)
- Ensure file is in your build
- Check clangd logs with `CLANGD_LOG_LEVEL=verbose`

### Clangd crashes repeatedly

```
Error: Max restart attempts reached, giving up
```

**Solutions:**
- Check clangd version compatibility
- Look at clangd stderr output in logs
- Try different clangd arguments via `CLANGD_ARGS`
- Ensure compile_commands.json is valid JSON

### Verbose logging

For detailed debugging:

```json
{
  "mcpServers": {
    "clangd": {
      "command": "clangd-mcp-server",
      "env": {
        "LOG_LEVEL": "DEBUG",
        "CLANGD_LOG_LEVEL": "verbose"
      }
    }
  }
}
```

Check stderr output (usually in Claude Code logs).

## Architecture

```
Claude Code
    ↓ MCP (stdio)
clangd-mcp-server
    ├── ClangdManager (lifecycle, health monitoring)
    ├── LSPClient (JSON-RPC over stdio)
    ├── FileTracker (didOpen/didClose)
    └── Tools (find_definition, find_references, etc.)
        ↓ LSP requests
    clangd subprocess
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Test locally
node dist/index.js
```

## License

This project is licensed under the Mozilla Public License Version 2.0 (MPL-2.0).
See [LICENSE](LICENSE) file for details.

## Contributing

Contributions welcome! This is an experimental project. Please open issues for bugs or feature requests.

## Known Limitations

- Does not connect to IDE-managed clangd instances
- No file watching (changes require manual didChange, not implemented)
- No custom compilation database generation
- Does not bundle clangd binary
- Single clangd instance per MCP server (one per project root)

## References

- [Model Context Protocol](https://modelcontextprotocol.io)
- [clangd](https://clangd.llvm.org)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
