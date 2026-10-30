export type MotionPreference = 'system' | 'reduced';

export const MOTION_PREFERENCE_KEY = 'motes.motionPreference';

export function parseMotionPreference(value: unknown): MotionPreference {
  return value === 'reduced' ? 'reduced' : 'system';
}

export function shouldReduceMotion(preference: MotionPreference, systemPrefersReducedMotion: boolean): boolean {
  return preference === 'reduced' || (preference === 'system' && systemPrefersReducedMotion);
}

export function isWorkbenchPath(pathname: string): boolean {
  return pathname === '/' || ['/settings', '/manage', '/compare'].some(path => pathname === path || pathname.startsWith(`${path}/`));
}
