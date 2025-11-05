// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { Readable, Writable } from 'node:stream';
import { logger } from './utils/logger.js';
import { LSPError, withTimeout } from './utils/errors.js';

interface JsonRpcMessage {
  jsonrpc: '2.0';
}

interface JsonRpcRequest extends JsonRpcMessage {
  id: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse extends JsonRpcMessage {
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface JsonRpcNotification extends JsonRpcMessage {
  method: string;
  params?: any;
}

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (error: any) => void;
};

export class LSPClient {
  private stdin: Writable;
  private stdout: Readable;
  private nextId: number = 1;
  private pendingRequests: Map<number | string, PendingRequest> = new Map();
  private buffer: string = '';
  private notificationHandlers: Map<string, (params: any) => void> = new Map();

  constructor(stdin: Writable, stdout: Readable) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.setupStreamHandlers();
  }

  private setupStreamHandlers(): void {
    this.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
      this.processBuffer();
    });

    this.stdout.on('error', (error) => {
      logger.error('LSP stdout error:', error);
    });

    this.stdout.on('end', () => {
      logger.info('LSP stdout ended');
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests.entries()) {
        pending.reject(new Error('LSP connection closed'));
      }
      this.pendingRequests.clear();
    });
  }

  private processBuffer(): void {
    while (true) {
      // Look for Content-Length header
      const headerMatch = this.buffer.match(/Content-Length: (\d+)\r\n/);
      if (!headerMatch) {
        break;
      }

      const contentLength = parseInt(headerMatch[1], 10);
      const headerEnd = this.buffer.indexOf('\r\n\r\n');

      if (headerEnd === -1) {
        break;
      }

      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) {
        // Not enough data yet
        break;
      }

      const messageText = this.buffer.substring(messageStart, messageEnd);
      this.buffer = this.buffer.substring(messageEnd);

      try {
        const message = JSON.parse(messageText);
        this.handleMessage(message);
      } catch (error) {
        logger.error('Failed to parse LSP message:', error, 'Message:', messageText);
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if ('id' in message && ('result' in message || 'error' in message)) {
      // Response
      this.handleResponse(message as JsonRpcResponse);
    } else if ('method' in message && !('id' in message)) {
      // Notification
      this.handleNotification(message as JsonRpcNotification);
    } else {
      logger.warn('Unknown message type:', message);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      logger.warn('Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new LSPError(
        response.error.message,
        response.error.code,
        response.error.data
      ));
    } else {
      pending.resolve(response.result);
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    logger.debug('Received notification:', notification.method);

    const handler = this.notificationHandlers.get(notification.method);
    if (handler) {
      try {
        handler(notification.params);
      } catch (error) {
        logger.error('Error in notification handler:', error);
      }
    }
  }

  /**
   * Register a handler for a specific notification method
   */
  onNotification(method: string, handler: (params: any) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  /**
   * Send a request and wait for the response
   */
  async request(method: string, params?: any, timeoutMs: number = 30000): Promise<any> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const promise = new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });

    this.sendMessage(request);

    try {
      return await withTimeout(promise, timeoutMs, `LSP request '${method}' timed out after ${timeoutMs}ms`);
    } catch (error) {
      this.pendingRequests.delete(id);
      throw error;
    }
  }

  /**
   * Send a notification (no response expected)
   */
  notify(method: string, params?: any): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    };

    this.sendMessage(notification);
  }

  private sendMessage(message: JsonRpcMessage): void {
    const content = JSON.stringify(message);
    const contentLength = Buffer.byteLength(content, 'utf-8');
    const header = `Content-Length: ${contentLength}\r\n\r\n`;
    const fullMessage = header + content;

    logger.debug('Sending LSP message:', message);
    this.stdin.write(fullMessage);
  }

  /**
   * Close the LSP client
   */
  close(): void {
    this.stdin.end();
  }
}
