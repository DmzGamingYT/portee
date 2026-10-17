import { describe, expect, it } from 'vitest';
import { themeFromMatches } from './useAutoTheme';

describe('themeFromMatches', () => {
  it('suit la préférence système jour/nuit', () => {
    expect(themeFromMatches(true)).toBe('light');
    expect(themeFromMatches(false)).toBe('dark');
  });
});
