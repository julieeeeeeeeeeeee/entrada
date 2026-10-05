// Avisos de novos e-mails.
// Sem servidor, o Android só deixa o app acordar sozinho a cada ~15 minutos. Nesse momento ele olha o Gmail
// e, se tiver e-mail novo não lido, mostra uma notificação. (Aviso na hora exigiria um servidor do Google Pub/Sub.)
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, EventType } from 'react-native-notify-kit';
import * as TaskManager from 'expo-task-manager';
import { getAccessToken, hasSession, isConfigured } from './mail/auth';
import { parseAddr } from './util';

const TASK = 'entrada-check-mail';
const KEY_ON = 'entrada.notify';
const KEY_SEEN = 'entrada.seen';
const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const PUSH_TASK = 'entrada-push-wake';
const KEY_WATCH = 'entrada.watchAt';
const KEY_RT = 'entrada.realtime';
const KEY_LAST = 'entrada.lastCheck';
// servidor que recebe o aviso do Gmail e acorda o app (Supabase) e tópico do Google Pub/Sub
const REGISTER_URL = 'https://ribdmjrdwwnrvfdlrxfw.supabase.co/functions/v1/entrada-push/register';
const TOPIC = 'projects/entrada-510619/topics/gmail-push';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export const notifyEnabled = async () => (await AsyncStorage.getItem(KEY_ON)) === '1';

/** Procura e-mails novos não lidos e avisa. Na primeira vez só "decora" o que já existe (sem avisar de tudo). */
export async function checkNewMail(): Promise<number> {
  if (!isConfigured || !(await hasSession())) return 0;
  const headers = { Authorization: `Bearer ${await getAccessToken()}` };
  // toda a caixa de entrada não lida, inclusive Promoções/Social/Atualizações (nenhuma categoria é filtrada)
  const r = await fetch(`${BASE}/threads?labelIds=INBOX&labelIds=UNREAD&maxResults=40`, { headers });
  if (!r.ok) throw new Error(`Gmail ${r.status}`);
  const threads: { id: string; historyId: string }[] = (await r.json()).threads ?? [];

  const raw = await AsyncStorage.getItem(KEY_SEEN);
  const seen = new Set<string>(raw ? JSON.parse(raw) : []);
  const keyOf = (t: { id: string; historyId: string }) => `${t.id}:${t.historyId}`; // resposta nova na mesma conversa também avisa
  const fresh = threads.filter((t) => !seen.has(keyOf(t)));
  threads.forEach((t) => seen.add(keyOf(t)));
  await AsyncStorage.setItem(KEY_SEEN, JSON.stringify([...seen].slice(-600)));
  await AsyncStorage.setItem(KEY_LAST, JSON.stringify({ at: Date.now(), listed: threads.length, fresh: raw === null ? 0 : fresh.length }));
  if (raw === null || fresh.length === 0) return 0;

  for (const t of fresh.slice(0, 8)) {
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
    await showMail(from.name, `${subject}\n${(last.snippet ?? '').slice(0, 120)}`, { threadId: t.id, subject, email: from.email }, from.email);
  }
  if (fresh.length > 8) await showMail('Entrada', `Mais ${fresh.length - 8} e-mails novos`, {});
  return fresh.length;
}

export const ACTION_READ = 'read';
export const ACTION_BLOCK = 'block';
const KEY_PHOTOS = 'entrada.photos.v1';

/** foto do remetente: dos seus contatos (guardada no celular) ou do Gravatar, se existir */
async function photoFor(email: string): Promise<string | undefined> {
  const e = email.trim().toLowerCase();
  if (!e) return undefined;
  try {
    const raw = await AsyncStorage.getItem(KEY_PHOTOS);
    const m = raw ? JSON.parse(raw) : {};
    if (m[e]) return m[e];
  } catch { /* sem fotos guardadas */ }
  try {
    const h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, e);
    const url = `https://gravatar.com/avatar/${h}?s=192&d=404`;
    const r = await fetch(url, { method: 'HEAD' });
    if (r.ok) return url;
  } catch { /* sem Gravatar */ }
  return undefined;
}

/** mostra a notificação de e-mail: foto redonda do remetente e botões Marcar como lido / Bloquear remetente */
async function showMail(title: string, body: string, data: Record<string, string>, email = '') {
  await notifee.createChannel({ id: 'mail', name: 'Novos e-mails', importance: AndroidImportance.HIGH, lights: true, lightColor: '#1877f2' });
  const largeIcon = email ? await photoFor(email) : undefined;
  const hasThread = !!data.threadId;
  await notifee.displayNotification({
    title, body, data,
    android: {
      channelId: 'mail',
      smallIcon: 'notification_small',
      color: '#1877f2',
      largeIcon,
      circularLargeIcon: !!largeIcon,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: hasThread
        ? [
            { title: 'Marcar como lido', pressAction: { id: ACTION_READ } },
            { title: 'Bloquear remetente', pressAction: { id: ACTION_BLOCK } },
          ]
        : [],
    },
  });
}

/** executa o botão tocado na notificação direto no Gmail */
export async function handleNotifAction(action: string, data: { threadId?: string; email?: string } | undefined, notifId?: string) {
  if (!data?.threadId || (action !== ACTION_READ && action !== ACTION_BLOCK)) return;
  try {
    const headers = { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' };
    if (action === ACTION_READ) {
      await fetch(`${BASE}/threads/${data.threadId}/modify`, { method: 'POST', headers, body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) });
    } else if (data.email) {
      await fetch(`${BASE}/settings/filters`, {
        method: 'POST', headers,
        body: JSON.stringify({ criteria: { from: data.email }, action: { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] } }),
      });
      await fetch(`${BASE}/threads/${data.threadId}/trash`, { method: 'POST', headers });
    }
  } catch { /* se falhar, o e-mail continua como estava */ }
  if (notifId) notifee.cancelNotification(notifId).catch(() => {});
}

// ---- toques na notificação ----
type OpenCb = (d: { threadId: string; subject?: string }) => void;
let openCb: OpenCb | null = null;
const opened = new Set<string>();

/** a tela principal se inscreve aqui para abrir o e-mail quando você toca na notificação */
export function onOpenThread(cb: OpenCb) {
  openCb = cb;
  // app aberto direto pela notificação (estava fechado)
  notifee.getInitialNotification().then((n) => {
    if (n?.notification.id && !opened.has(n.notification.id)) handlePress(n.notification, n.pressAction?.id);
  }).catch(() => {});
  return () => { if (openCb === cb) openCb = null; };
}

function handlePress(n: { id?: string; data?: Record<string, any> } | undefined, actionId?: string) {
  const d = n?.data as { threadId?: string; subject?: string; email?: string } | undefined;
  if (!n || !d?.threadId) return;
  if (actionId === ACTION_READ || actionId === ACTION_BLOCK) { handleNotifAction(actionId, d, n.id); return; }
  if (actionId && actionId !== 'default') return;
  if (n.id) { if (opened.has(n.id)) return; opened.add(n.id); }
  openCb?.({ threadId: d.threadId, subject: d.subject });
}

const onEvent = async ({ type, detail }: { type: EventType; detail: { notification?: any; pressAction?: { id: string } } }) => {
  if (type === EventType.ACTION_PRESS || type === EventType.PRESS) handlePress(detail.notification, detail.pressAction?.id);
};
notifee.onBackgroundEvent(onEvent as any);
notifee.onForegroundEvent(onEvent as any);

// o servidor manda um sinal silencioso: o app acorda, confere o Gmail e mostra a notificação
TaskManager.defineTask(PUSH_TASK, async () => {
  try {
    if (await notifyEnabled()) await checkNewMail();
  } catch { /* tenta no próximo sinal */ }
});

TaskManager.defineTask(TASK, async () => {
  try {
    if (await notifyEnabled()) { await checkNewMail(); await watchMailbox().catch(() => {}); }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** cadastra este aparelho no servidor (só aceita a sua conta Google) */
async function registerDevice() {
  const t = await Notifications.getDevicePushTokenAsync();
  const r = await fetch(REGISTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: String(t.data) }),
  });
  if (!r.ok) throw new Error(`cadastro do aparelho: ${r.status}`);
}

/** pede ao Gmail para avisar o servidor a cada e-mail novo. O pedido vale 7 dias, então renovamos todo dia. */
async function watchMailbox(force = false) {
  const last = Number((await AsyncStorage.getItem(KEY_WATCH)) ?? 0);
  if (!force && Date.now() - last < 20 * 3600_000) return;
  const r = await fetch(`${BASE}/watch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName: TOPIC, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }),
  });
  if (!r.ok) throw new Error(`aviso do Gmail: ${r.status} ${(await r.text()).slice(0, 120)}`);
  await AsyncStorage.setItem(KEY_WATCH, String(Date.now()));
}

let tokenListener = false;

/** liga o aviso em tempo real. Guarda o resultado para mostrar em Configurações. */
export async function ensureRealtime(force = false): Promise<string> {
  try {
    await Notifications.registerTaskAsync(PUSH_TASK);
    await registerDevice();
    await watchMailbox(force);
    if (!tokenListener) {
      tokenListener = true;
      Notifications.addPushTokenListener(() => { registerDevice().catch(() => {}); });
    }
    await AsyncStorage.setItem(KEY_RT, 'ok');
    return 'ok';
  } catch (e) {
    const msg = `erro: ${e instanceof Error ? e.message : String(e)}`;
    await AsyncStorage.setItem(KEY_RT, msg);
    return msg;
  }
}

export const realtimeStatus = async () => (await AsyncStorage.getItem(KEY_RT)) ?? '';

/** última vez que o app conferiu o Gmail em segundo plano, em frase pronta para Configurações */
export async function lastCheckText(): Promise<string> {
  try {
    const j = JSON.parse((await AsyncStorage.getItem(KEY_LAST)) ?? 'null');
    if (!j) return 'Ainda não conferiu o Gmail em segundo plano.';
    const hora = new Date(j.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `Última conferida: ${hora} — ${j.listed} não lidos na caixa, ${j.fresh} novos avisados.`;
  } catch { return ''; }
}

async function register() {
  await Notifications.setNotificationChannelAsync('mail', {
    name: 'Novos e-mails',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#1877f2',
  });
  await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  await ensureRealtime();
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
