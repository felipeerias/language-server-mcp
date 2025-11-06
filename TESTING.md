# Testing Guide

## Running Tests

```bash
npm test                # All tests
npm run test:unit       # Unit tests
npm run test:coverage   # With coverage
npm run test:watch      # Watch mode
```

## Structure

```
tests/
├── unit/                         ✅ 6 files completed
│   ├── utils/                    ✅ uri, errors, logger
│   ├── config-detector.test.ts   ✅
│   ├── lsp-client.test.ts        ✅
│   ├── file-tracker.test.ts      ✅
│   ├── clangd-manager.test.ts    ⏳ TODO
│   └── tools/*.test.ts           ⏳ TODO (6 tools)
├── integration/                  ⏳ TODO
├── e2e/                          ⏳ TODO
└── helpers/                      ✅ Mock utilities
```

## Coverage

**Current**: ~60% (95+ tests across core modules)
- ✅ Utils (uri, errors, logger)
- ✅ Config detector
- ✅ LSP client (JSON-RPC, Content-Length framing, concurrent requests)
- ✅ File tracker (didOpen/didClose, language ID detection)

**TODO**:
- Clangd manager (spawning, crash recovery, graceful shutdown)
- Tool implementations (6 tools: definition, references, hover, workspace symbols, implementations, document symbols)
- Integration tests (full LSP flows, component integration)
- E2E tests (real clangd with sample C++ project)

## Test Helpers

**`tests/helpers/mock-streams.ts`**: Mock stdio streams, LSP message formatting/parsing
**`tests/helpers/mock-lsp-responses.ts`**: Pre-built LSP responses for all methods
**`tests/helpers/mock-process.ts`**: Mock child process for testing clangd manager

## Writing Tests

**Example - Testing a new LSP tool:**
```typescript
// tests/unit/tools/my-tool.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MyTool } from '../../../src/tools/my-tool.js';
import { createMockLSPClient } from '../../helpers/mock-lsp-responses.js';

describe('MyTool', () => {
  it('should handle successful LSP response', async () => {
    // Arrange
    const mockClient = createMockLSPClient();
    const tool = new MyTool(mockClient);

    // Act
    const result = await tool.execute({file: 'test.cpp', line: 10});

    // Assert
    expect(result).toMatchObject({location: expect.any(String)});
  });
});
```

**Guidelines:**
- Use descriptive test names: "should handle partial message buffers"
- Follow AAA pattern: Arrange, Act, Assert
- Test edge cases and error paths
- Mock external dependencies (file system, child processes)
- Clean up after tests (temp files, env vars)
- Use test helpers from `tests/helpers/`
- Avoid flaky tests (proper async patterns, no fixed timeouts)

## Troubleshooting

**"Cannot find module"**: Run `npm run build` first, check .js extensions in imports
**Timeouts**: Increase timeout in jest.config.js or per-test: `it('test', async () => {...}, 10000)`
**Flaky tests**: Avoid fixed timeouts, clean up resources properly
