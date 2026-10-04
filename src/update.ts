// Atualização pelo GitHub: olha a última Release, baixa o APK e abre o instalador do Android.
import Constants from 'expo-constants';
import * as FS from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { GITHUB_REPO } from './config';

export interface Release {
  version: string;
  url: string;
  notes: string;
  size: number;
}

export const currentVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
export function isNewer(a: string, b: string): boolean {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Devolve a versão nova, ou null se você já está na mais recente. */
export async function checkUpdate(): Promise<Release | null> {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (r.status === 404) return null; // ainda não existe nenhuma Release
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
  const j = await r.json();
  const asset = (j.assets as { name: string; browser_download_url: string; size: number }[]).find((a) => a.name.endsWith('.apk'));
  if (!asset) return null;
  const version = String(j.tag_name).replace(/^v/, '');
  return isNewer(version, currentVersion()) ? { version, url: asset.browser_download_url, notes: j.body ?? '', size: asset.size } : null;
}

export async function downloadAndInstall(rel: Release, onProgress: (p: number) => void): Promise<void> {
  const dest = `${FS.cacheDirectory}entrada-${rel.version}.apk`;
  const dl = FS.createDownloadResumable(rel.url, dest, {}, (p) =>
    onProgress(p.totalBytesWritten / (p.totalBytesExpectedToWrite || rel.size || 1)),
  );
  await dl.downloadAsync();
  const uri = await FS.getContentUriAsync(dest);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: uri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    type: 'application/vnd.android.package-archive',
  });
}
