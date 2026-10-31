export const PALETTE_PREFERENCE_KEY = 'motes.palettePreference';

export const PALETTE_OPTIONS = [
  { value: 'blue', zh: '雾蓝', en: 'Mist blue' },
  { value: 'violet', zh: '鸢紫', en: 'Iris violet' },
  { value: 'mint', zh: '薄荷', en: 'Soft mint' },
  { value: 'slate', zh: '银灰', en: 'Silver slate' },
] as const;
export const PALETTE_PREFERENCES = PALETTE_OPTIONS.map(option => option.value);
export type PalettePreference = (typeof PALETTE_OPTIONS)[number]['value'];

export function parsePalettePreference(value: unknown): PalettePreference {
  return PALETTE_PREFERENCES.includes(value as PalettePreference) ? value as PalettePreference : 'slate';
}

export function resolvePalette(preference: PalettePreference): PalettePreference {
  return preference;
}
