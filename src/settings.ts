// Preferências do app, guardadas no celular.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export interface Prefs {
  groupByDate: boolean; // lista agrupada por Hoje / Ontem / ...
  darkEmails: boolean; // e-mails em HTML no modo escuro
  signature: string; // despedida que já vem em todo e-mail novo
  archiveOnReply: boolean; // arquivar a conversa depois de responder
  archiveOld: boolean; // arquivar e-mails já lidos com mais de 30 dias
}
const DEFAULTS: Prefs = { groupByDate: false, darkEmails: true, signature: 'Abraços,\nJulie', archiveOnReply: false, archiveOld: false };
const KEY = 'entrada.prefs';

let prefs: Prefs = { ...DEFAULTS };
const listeners = new Set<() => void>();

AsyncStorage.getItem(KEY)
  .then((raw) => { if (raw) { prefs = { ...DEFAULTS, ...JSON.parse(raw) }; listeners.forEach((l) => l()); } })
  .catch(() => {});

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  prefs = { ...prefs, [k]: v };
  AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
  listeners.forEach((l) => l());
}

export const getPrefs = () => prefs;

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => prefs,
  );
}
