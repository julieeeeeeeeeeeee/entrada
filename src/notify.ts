// Avisos de novos e-mails.
// Sem servidor, o Android só deixa o app acordar sozinho a cada ~15 minutos. Nesse momento ele olha o Gmail
// e, se tiver e-mail novo não lido, mostra uma notificação. (Aviso na hora exigiria um servidor do Google Pub/Sub.)
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { getAccessToken, hasSession, isConfigured } from './mail/auth';
import { parseAddr } from './util';

const TASK = 'entrada-check-mail';
const KEY_ON = 'entrada.notify';
const KEY_SEEN = 'entrada.seen';
const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export const notifyEnabled = async () => (await AsyncStorage.getItem(KEY_ON)) === '1';

/** Procura e-mails novos não lidos e avisa. Na primeira vez só "decora" o que já existe (sem avisar de tudo). */
export async function checkNewMail(): Promise<number> {
  if (!isConfigured || !(await hasSession())) return 0;
  const headers = { Authorization: `Bearer ${await getAccessToken()}` };
  const r = await fetch(`${BASE}/threads?labelIds=INBOX&labelIds=UNREAD&maxResults=10`, { headers });
  if (!r.ok) throw new Error(`Gmail ${r.status}`);
  const threads: { id: string; historyId: string }[] = (await r.json()).threads ?? [];

  const raw = await AsyncStorage.getItem(KEY_SEEN);
  const seen = new Set<string>(raw ? JSON.parse(raw) : []);
  const keyOf = (t: { id: string; historyId: string }) => `${t.id}:${t.historyId}`; // resposta nova na mesma conversa também avisa
  const fresh = threads.filter((t) => !seen.has(keyOf(t)));
  threads.forEach((t) => seen.add(keyOf(t)));
  await AsyncStorage.setItem(KEY_SEEN, JSON.stringify([...seen].slice(-300)));
  if (raw === null || fresh.length === 0) return 0;

  for (const t of fresh.slice(0, 4)) {
    const tr = await fetch(
      `${BASE}/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=messages(snippet,payload/headers)`,
      { headers },
    );
    if (!tr.ok) continue;
    const msgs: any[] = (await tr.json()).messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last) continue;
    const h = (n: string) => last.payload?.headers?.find((x: any) => x.name.toLowerCase() === n)?.value ?? '';
    const from = parseAddr(h('from'));
    const subject = h('subject') || '(sem assunto)';
    await Notifications.scheduleNotificationAsync({
      content: { title: from.name, body: `${subject}\n${(last.snippet ?? '').slice(0, 120)}`, data: { threadId: t.id, subject } },
      trigger: { channelId: 'mail' },
    });
  }
  if (fresh.length > 4) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Entrada', body: `Mais ${fresh.length - 4} e-mails novos` },
      trigger: { channelId: 'mail' },
    });
  }
  return fresh.length;
}

TaskManager.defineTask(TASK, async () => {
  try {
    if (await notifyEnabled()) await checkNewMail();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

async function register() {
  await Notifications.setNotificationChannelAsync('mail', {
    name: 'Novos e-mails',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#1877f2',
  });
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
}

/** pede permissão e liga os avisos. Devolve false se você negou a permissão. */
export async function enableNotify(): Promise<boolean> {
  const p = await Notifications.requestPermissionsAsync();
  if (p.status !== 'granted') return false;
  await AsyncStorage.setItem(KEY_ON, '1');
  await register();
  await checkNewMail().catch(() => {}); // "decora" o que já está na caixa
  return true;
}

export async function disableNotify(): Promise<void> {
  await AsyncStorage.setItem(KEY_ON, '0');
  await BackgroundTask.unregisterTaskAsync(TASK).catch(() => {});
}

/** ao abrir o app: se estava ligado, garante que a tarefa continua registrada */
export async function ensureNotify(): Promise<void> {
  if (await notifyEnabled()) await register().catch(() => {});
}
