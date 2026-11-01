import {offlineCoreMessages} from './offline-core';
import {uxCoreMessages} from './ux-core';
import {uxPanelMessages} from './ux-panels';
import {uxLayoutMessages} from './ux-layout';
import { backupMessages } from './backup';
import { homeMessages } from './home';
import { pageMessages } from './pages';
import { componentMessages } from './components';
import { sharedMessages } from './shared';

export type HostLocale = 'zh-CN' | 'en';
export const HOST_LOCALE_KEY = 'motes:host-locale:v1';
export const hostMessages = { ...offlineCoreMessages, ...homeMessages, ...pageMessages, ...componentMessages, ...sharedMessages, ...backupMessages, ...uxCoreMessages, ...uxPanelMessages, ...uxLayoutMessages } as const;
export type HostMessageKey = keyof typeof hostMessages;
export type HostMessageParams = Readonly<Record<string, string | number>>;
export function parseHostLocale(value: unknown): HostLocale { return value === 'en' ? 'en' : 'zh-CN'; }
/** Replaces named tokens once. Values are plain text; never reinterpreted as markup or tokens. */
export function formatHostMessage(message: string, params: HostMessageParams = {}): string {
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, key: string) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : token);
}
export function translateHostMessage(locale: HostLocale, key: HostMessageKey, params?: HostMessageParams): string {
  return formatHostMessage(locale === 'en' ? hostMessages[key] : key, params);
}
