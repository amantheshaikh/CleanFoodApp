import { Capacitor } from '@capacitor/core';

function normaliseBase(base?: string | null): string {
  if (!base) return '';
  return base.trim().replace(/\/$/, '');
}

function replaceHostname(raw: string, hostname: string): string {
  try {
    const url = new URL(raw);
    url.hostname = hostname;
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    return raw.replace('localhost', hostname);
  }
}

export function resolveApiBase(): string {
  const base = normaliseBase(import.meta.env.VITE_API_BASE as string | undefined);
  if (!base) {
    return '';
  }

  if (!base.includes('localhost')) {
    return base;
  }

  const platform = Capacitor?.getPlatform?.() ?? 'web';
  if (platform === 'android') {
    return replaceHostname(base, '10.0.2.2');
  }

  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    if (currentHost && currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
      return replaceHostname(base, currentHost);
    }
  }

  return base;
}
