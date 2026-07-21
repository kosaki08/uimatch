import { describe, expect, test } from 'vitest';
import { parseFigmaRef } from './figma-mcp.js';

describe('parseFigmaRef', () => {
  test('resolves the current selection keyword', () => {
    expect(parseFigmaRef('current')).toBe('current');
  });

  test.each([
    // Figma URLs expose node ids as "1-2", the REST API as "1:2". Both are
    // pasted into the shorthand, so both must survive it.
    ['AbCdEf123:1-2', { fileKey: 'AbCdEf123', nodeId: '1-2' }],
    ['AbCdEf123:1:2', { fileKey: 'AbCdEf123', nodeId: '1:2' }],
    ['AbCdEf123:0:1:2', { fileKey: 'AbCdEf123', nodeId: '0:1:2' }],
  ])('keeps the whole node id in %s', (ref, expected) => {
    expect(parseFigmaRef(ref)).toEqual(expected);
  });

  test.each(['AbCdEf123:', ':1:2', ':'])('rejects %s', (ref) => {
    expect(() => parseFigmaRef(ref)).toThrow('Invalid figma ref');
  });

  test.each([
    ['https://figma.com/file/AbCdEf123/Design?node-id=1-2', '1-2'],
    ['https://figma.com/design/AbCdEf123/Design?node-id=1%3A2', '1:2'],
  ])('parses the Figma URL %s', (ref, nodeId) => {
    expect(parseFigmaRef(ref)).toEqual({ fileKey: 'AbCdEf123', nodeId });
  });

  test('rejects a URL without a node id', () => {
    expect(() => parseFigmaRef('https://figma.com/file/AbCdEf123/Design')).toThrow(
      'Unsupported Figma reference'
    );
  });
});
