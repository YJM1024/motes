export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_PREFERENCE_KEY = 'motes.themePreference';

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'dark' || value === 'system' || value === 'light' ? value : 'light';
}

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): 'light' | 'dark' {
  if (preference === 'system') return systemIsDark ? 'dark' : 'light';
  return preference;
}
