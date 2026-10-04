// Fotos dos contatos (vindas da People API do Google). Guardadas em memória e avisam quem estiver usando.
import { useSyncExternalStore } from 'react';

let map: Record<string, string> = {};
let version = 0;
const listeners = new Set<() => void>();

export function setPhotos(next: Record<string, string>) {
  map = next;
  version++;
  listeners.forEach((l) => l());
}

export function usePhoto(email: string): string | undefined {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => version,
  );
  return email ? map[email.trim().toLowerCase()] : undefined;
}
