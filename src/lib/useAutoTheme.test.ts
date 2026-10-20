import { describe, expect, it } from 'vitest';
import { resolveTheme } from './useAutoTheme';

describe('resolveTheme', () => {
  it('suit la préférence système en mode auto', () => {
    expect(resolveTheme('auto', true)).toBe('light');
    expect(resolveTheme('auto', false)).toBe('dark');
  });

  it('ignore le système quand un thème est forcé', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});
