import { describe, it, expect } from 'vitest';
import { VERSION, PORT, handleRequest } from './index.js';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

describe('SocialiseHub', () => {
  it('exports a version string', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('exports a default port', () => {
    expect(PORT).toBe(3000);
  });

  it('handleRequest returns JSON with name and version', () => {
    let statusCode: number | undefined;
    let headers: Record<string, string> = {};
    let body = '';

    const req = new IncomingMessage(new Socket());
    const res = new ServerResponse(req);

    res.writeHead = (code: number, h?: Record<string, string>) => {
      statusCode = code;
      headers = h ?? {};
      return res;
    };
    res.end = ((data?: string) => {
      body = data ?? '';
      return res;
    }) as ServerResponse['end'];

    handleRequest(req, res);

    expect(statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(body)).toEqual({ name: 'SocialiseHub', version: '0.1.0' });
  });
});
