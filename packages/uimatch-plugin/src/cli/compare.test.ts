import { describe, expect, test } from 'bun:test';
import type { ParsedArgs } from './compare.js';
import { buildCompareConfig } from './compare.js';

describe('buildCompareConfig', () => {
  describe('emitArtifacts auto-enable', () => {
    test('should enable emitArtifacts when outDir is specified', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        outDir: './out',
      };

      const config = buildCompareConfig(args);

      expect(config.emitArtifacts).toBe(true);
    });

    test('should enable emitArtifacts when explicitly set', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        emitArtifacts: true,
      };

      const config = buildCompareConfig(args);

      expect(config.emitArtifacts).toBe(true);
    });

    test('should not enable emitArtifacts by default', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.emitArtifacts).toBe(false);
    });
  });

  describe('viewport parsing', () => {
    test('should parse viewport with lowercase x', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        viewport: '1584x1104',
      };

      const config = buildCompareConfig(args);

      expect(config.viewport).toEqual({ width: 1584, height: 1104 });
    });

    test('should parse viewport with uppercase X', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        viewport: '1920X1080',
      };

      const config = buildCompareConfig(args);

      expect(config.viewport).toEqual({ width: 1920, height: 1080 });
    });

    test('should skip invalid viewport', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        viewport: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.viewport).toBeUndefined();
    });
  });

  describe('dpr parsing', () => {
    test('should parse valid dpr', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        dpr: '2',
      };

      const config = buildCompareConfig(args);

      expect(config.dpr).toBe(2);
    });

    test('should skip invalid dpr', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        dpr: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.dpr).toBeUndefined();
    });
  });

  describe('size mode parsing', () => {
    test.each(['strict', 'pad', 'crop', 'scale'] as const)(
      'should parse valid size mode: %s',
      (mode) => {
        const args: ParsedArgs = {
          figma: 'AbCdEf:1-23',
          story: 'http://localhost:6006',
          selector: '#root',
          size: mode,
        };

        const config = buildCompareConfig(args);

        expect(config.sizeMode).toBe(mode);
      }
    );

    test('should skip invalid size mode', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        size: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.sizeMode).toBeUndefined();
    });
  });

  describe('alignment parsing', () => {
    test.each(['center', 'top-left', 'top', 'left'] as const)(
      'should parse valid alignment: %s',
      (align) => {
        const args: ParsedArgs = {
          figma: 'AbCdEf:1-23',
          story: 'http://localhost:6006',
          selector: '#root',
          align,
        };

        const config = buildCompareConfig(args);

        expect(config.align).toBe(align);
      }
    );
  });

  describe('contentBasis parsing', () => {
    test.each(['union', 'intersection', 'figma', 'impl'] as const)(
      'should parse valid contentBasis: %s',
      (basis) => {
        const args: ParsedArgs = {
          figma: 'AbCdEf:1-23',
          story: 'http://localhost:6006',
          selector: '#root',
          contentBasis: basis,
        };

        const config = buildCompareConfig(args);

        expect(config.contentBasis).toBe(basis);
      }
    );
  });

  describe('padColor parsing', () => {
    test('should parse hex color', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        padColor: '#FF5733',
      };

      const config = buildCompareConfig(args);

      expect(config.padColor).toEqual({ r: 255, g: 87, b: 51 });
    });

    test('should parse auto padColor', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        padColor: 'auto',
      };

      const config = buildCompareConfig(args);

      expect(config.padColor).toBe('auto');
    });

    test('should skip invalid padColor', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        padColor: 'invalid',
      };

      const config = buildCompareConfig(args);

      expect(config.padColor).toBeUndefined();
    });
  });

  describe('detectStorybookIframe auto-default', () => {
    test('should auto-enable for Storybook iframe URL', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006/iframe.html?id=button--default',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(true);
    });

    test('should not auto-enable for non-Storybook URL', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:3000/button',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(false);
    });

    test('should respect explicit true override', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:3000/button',
        selector: '#root',
        detectStorybookIframe: 'true',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(true);
    });

    test('should respect explicit false override', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006/iframe.html?id=button--default',
        selector: '#root',
        detectStorybookIframe: 'false',
      };

      const config = buildCompareConfig(args);

      expect(config.detectStorybookIframe).toBe(false);
    });
  });

  describe('bootstrap flag', () => {
    test('should default to true', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
      };

      const config = buildCompareConfig(args);

      expect(config.bootstrapExpectedFromFigma).toBe(true);
    });

    test('should parse true', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        bootstrap: 'true',
      };

      const config = buildCompareConfig(args);

      expect(config.bootstrapExpectedFromFigma).toBe(true);
    });

    test('should parse false', () => {
      const args: ParsedArgs = {
        figma: 'AbCdEf:1-23',
        story: 'http://localhost:6006',
        selector: '#root',
        bootstrap: 'false',
      };

      const config = buildCompareConfig(args);

      expect(config.bootstrapExpectedFromFigma).toBe(false);
    });
  });
});
