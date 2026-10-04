// Provider real: fala com a API do Gmail.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addContacts } from '../contacts';
import * as FS from 'expo-file-system/legacy';
import { classify } from '../classify';
import type { Account, Draft, FileRef, Msg, Provider, Row, Section } from '../types';
import { b64urlEncode, b64encode, b64decode, b64urlToB64, decodeBytes, fmtDateLong, fmtTime, parseAddr, stripHtml, utf8Encode } from '../util';
import { getAccessToken, userInfo } from './auth';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** chama o Gmail; se bater na cota (429), espera um pouco e tenta de novo */
async function g(path: string, init: { method?: string; body?: unknown } = {}, tries = 3): Promise<any> {
  const r = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const quota = r.status === 429 || (r.status === 403 && /quota|rate/i.test(j?.error?.message ?? ''));
    if (quota && tries > 1) {
      await sleep(4000 * (4 - tries));
      return g(path, init, tries - 1);
    }
    throw new Error(j?.error?.message ?? `Gmail ${r.status}`);
  }
  return j;
}

// só traz o que a lista precisa (sem o corpo dos e-mails)
const PART = 'mimeType,filename,body(size,attachmentId)';
const LIST_FIELDS = `id,messages(id,labelIds,internalDate,snippet,payload(headers,${PART},parts(${PART},parts(${PART},parts(${PART})))))`;

const header = (m: any, n: string): string =>
  m.payload?.headers?.find((h: any) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';

function collectFiles(m: any): FileRef[] {
  const out: FileRef[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({ id: p.body.attachmentId, msgId: m.id, name: p.filename, mime: p.mimeType ?? '', size: p.body.size ?? 0 });
    }
    (p.parts ?? []).forEach(walk);
  };
  walk(m.payload);
  return out;
}

const partHeader = (p: any, n: string): string =>
  p.headers?.find((h: any) => h.name.toLowerCase() === n)?.value ?? '';

/** texto de uma parte do e-mail, no charset que ela declara (utf-8, latin1...) */
function decodePart(p: any): string {
  const cs = /charset="?([\w-]+)"?/i.exec(partHeader(p, 'content-type'))?.[1] ?? 'utf-8';
  return decodeBytes(b64decode(p.body.data), cs);
}

function findPart(x: any, mime: string): string | null {
  if (x?.mimeType === mime && x.body?.data) return decodePart(x);
  for (const c of x?.parts ?? []) {
    const r = findPart(c, mime);
    if (r !== null) return r;
  }
  return null;
}

function bodyText(p: any): string {
  if (!p) return '';
  const plain = findPart(p, 'text/plain');
  if (plain && plain.trim() && !/^\s*https?:\/\/\S+\s*$/.test(plain)) return plain;
  const html = findPart(p, 'text/html');
  return html !== null ? stripHtml(html) : plain ?? '';
}

/** imagens embutidas no e-mail (cid:) -> endereço de dados, pra aparecerem no HTML */
async function inlineImages(m: any): Promise<Record<string, string>> {
  const found: { cid: string; mime: string; data?: string; att?: string; size: number }[] = [];
  const walk = (p: any) => {
    if (!p) return;
    const cid = partHeader(p, 'content-id').replace(/[<>]/g, '').trim();
    if (cid && String(p.mimeType).startsWith('image/')) found.push({ cid, mime: p.mimeType, data: p.body?.data, att: p.body?.attachmentId, size: p.body?.size ?? 0 });
    (p.parts ?? []).forEach(walk);
  };
  walk(m.payload);
  const out: Record<string, string> = {};
  await pool(found.filter((f) => f.size < 600_000).slice(0, 8), 3, async (f) => {
    try {
      let b64: string | null = null;
      if (f.data) b64 = b64urlToB64(f.data);
      else if (f.att) b64 = b64urlToB64((await g(`/messages/${m.id}/attachments/${f.att}`)).data);
      if (b64) out[f.cid] = `data:${f.mime};base64,${b64}`;
    } catch { /* imagem que não baixou fica de fora */ }
  });
  return out;
}

function threadToRow(t: any, sec: Section, self: string, hid?: string): Row {
  const msgs: any[] = t.messages ?? [];
  const last = msgs[msgs.length - 1] ?? {};
  const who = parseAddr(header(last, sec === 'enviados' ? 'To' : 'From'));
  const labels: string[] = msgs.flatMap((m) => m.labelIds ?? []);
  const subject = header(msgs[0] ?? last, 'Subject') || '(sem assunto)';
  const mine = who.email === self.toLowerCase();
  return {
    id: t.id,
    kind: 'mail',
    name: mine ? 'Você' : who.name,
    email: who.email,
    subject,
    snippet: (last.snippet ?? '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    time: fmtTime(Number(last.internalDate ?? Date.now())),
    ts: Number(last.internalDate ?? Date.now()),
    hid,
    unread: labels.includes('UNREAD'),
    count: msgs.length,
    files: msgs.flatMap(collectFiles),
    cat: classify(who.email, who.name, subject, labels),
  };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

function buildRaw(d: Draft): string {
  const subj = /^[\x20-\x7e]*$/.test(d.subject) ? d.subject : `=?UTF-8?B?${b64encode(utf8Encode(d.subject))}?=`;
  const body = b64encode(utf8Encode(d.body)).replace(/(.{76})/g, '$1\r\n');
  const lines = [
    `To: ${d.to}`,
    `Subject: ${subj}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ];
  if (d.inReplyTo) lines.push(`In-Reply-To: ${d.inReplyTo}`, `References: ${d.inReplyTo}`);
  return b64urlEncode(utf8Encode(lines.join('\r\n') + '\r\n\r\n' + body));
}

const DIAS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const MESES_C = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

/** "20261010T140000" ou "20261010T170000Z" ou "20261010" (dia inteiro) */
function icsDate(v: string): { d: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, da, h, mi, , z] = m;
  if (!h) return { d: new Date(+y, +mo - 1, +da), allDay: true };
  const d = z ? new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi)) : new Date(+y, +mo - 1, +da, +h, +mi);
  return { d, allDay: false };
}

const two = (n: number) => String(n).padStart(2, '0');

/** "dom., 10 de out. · 14:00–15:00" */
function whenText(a: ReturnType<typeof icsDate>, b: ReturnType<typeof icsDate>): string {
  if (!a) return '';
  const day = `${DIAS[a.d.getDay()]}, ${a.d.getDate()} de ${MESES_C[a.d.getMonth()]}`;
  if (a.allDay) return `${day} · dia inteiro`;
  const hm = (x: Date) => `${two(x.getHours())}:${two(x.getMinutes())}`;
  return `${day} · ${hm(a.d)}${b && !b.allDay ? `–${hm(b.d)}` : ''}`;
}

/** lê um convite (arquivo .ics do Google Agenda): convidados e dados do evento */
function parseInvite(ics: string | null, self: string): { people?: Msg['people']; invite?: Msg['invite'] } {
  if (!ics) return {};
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const val = (name: string) => {
    const l = lines.find((x) => x.startsWith(`${name}:`) || x.startsWith(`${name};`));
    return l ? l.slice(l.indexOf(':', name.length) + 1).replace(/\\n/g, ' ').replace(/\\,/g, ',').trim() : '';
  };
  const out: NonNullable<Msg['people']> = [];
  const seen = new Set<string>();
  let myStatus = '';
  for (const line of lines) {
    const org = line.startsWith('ORGANIZER');
    if (!org && !line.startsWith('ATTENDEE')) continue;
    const email = /mailto:([^\s;]+)/i.exec(line)?.[1]?.toLowerCase();
    if (!email || seen.has(email) || email.includes('calendar.google.com')) continue;
    seen.add(email);
    if (email === self.toLowerCase()) myStatus = /PARTSTAT=([A-Z-]+)/.exec(line)?.[1] ?? '';
    const cn = /CN=("([^"]*)"|[^;:]*)/i.exec(line);
    out.push({ name: (cn?.[2] ?? cn?.[1] ?? '').trim() || email.split('@')[0], email, org });
  }
  const uid = val('UID');
  const method = val('METHOD');
  const start = icsDate(val('DTSTART'));
  const invite: Msg['invite'] = uid && val('SUMMARY') ? {
    uid,
    title: val('SUMMARY'),
    when: whenText(start, icsDate(val('DTEND'))),
    where: val('LOCATION') || undefined,
    status: myStatus,
    canRsvp: method === 'REQUEST' && !!myStatus,
  } : undefined;
  return { people: out.length ? out : undefined, invite };
}

const CACHE_KEY = 'entrada.cache.v1';

export function createGmailProvider(): Provider {
  let self = '';
  // lista de cada seção: guardada no celular (só a Entrada) e na memória
  const mem: Partial<Record<Section, Row[]>> = {};
  let loaded = false;
  const loadDisk = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) Object.assign(mem, JSON.parse(raw));
    } catch { /* sem cache */ }
  };
  const saveDisk = () => AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ inbox: mem.inbox })).catch(() => {});
  const me = async (): Promise<Account> => {
    const a = await userInfo();
    self = a.email;
    return a;
  };

  // "página" seguinte do Gmail (para carregar e-mails mais antigos ao descer a lista)
  let nextTok: string | undefined;
  const list = async (sec: Section, q?: string, pageToken?: string): Promise<Row[]> => {
    if (!self) await me();
    if (!pageToken) nextTok = undefined;
    if (sec === 'rascunhos') {
      const j = await g('/drafts?maxResults=30');
      const drafts: any[] = j?.drafts ?? [];
      return pool(drafts, 4, async (d) => {
        const full = await g(`/drafts/${d.id}?format=full`);
        const m = full.message;
        const to = header(m, 'To');
        const subject = header(m, 'Subject');
        const body = bodyText(m.payload);
        const row: Row = {
          id: d.id, kind: 'draft', name: to ? parseAddr(to).name : 'Sem destinatário', email: to,
          subject: subject || '(sem assunto)', snippet: m.snippet ?? '', time: fmtTime(Number(m.internalDate ?? Date.now())),
          unread: false, count: 0, files: [], cat: 'pessoas',
          draft: { id: d.id, to, subject, body, threadId: m.threadId },
        };
        return row;
      });
    }
    if (sec === 'bloqueados') {
      const j = await g('/settings/filters');
      return ((j?.filter ?? []) as any[])
        .filter((f) => f.criteria?.from && f.action?.addLabelIds?.includes('TRASH'))
        .map((f) => ({
          id: f.id, kind: 'blocked' as const, name: parseAddr(f.criteria.from).name, email: f.criteria.from,
          subject: f.criteria.from, snippet: 'Remetente bloqueado', time: '', unread: false, count: 0, files: [], cat: 'pessoas' as const,
        }));
    }
    const params = new URLSearchParams({ maxResults: '20' });
    let query = q ?? '';
    // buscando, a Entrada procura em todos os e-mails (como o Gmail faz)
    if (sec === 'inbox' && !query) params.append('labelIds', 'INBOX');
    if (sec === 'enviados') params.append('labelIds', 'SENT');
    if (sec === 'lixeira') { params.append('labelIds', 'TRASH'); params.set('includeSpamTrash', 'true'); }
    if (sec === 'arquivados') query = `-in:inbox -in:sent -in:trash -in:spam -in:drafts ${query}`.trim();
    if (query) params.set('q', query);
    if (pageToken) params.set('pageToken', pageToken);
    await loadDisk();
    const j = await g(`/threads?${params}`);
    nextTok = j?.nextPageToken;
    const listed: { id: string; historyId: string }[] = j?.threads ?? [];
    // só rebusca as conversas novas ou que mudaram (a lista já traz a "versão" de cada uma)
    const old = new Map((q ? [] : mem[sec] ?? []).map((r) => [r.id, r]));
    const need = listed.filter((t) => old.get(t.id)?.hid !== t.historyId);
    const fetched = await pool(need, 3, (t) =>
      g(`/threads/${t.id}?format=full&fields=${encodeURIComponent(LIST_FIELDS)}`).then((x) => threadToRow(x, sec, self, t.historyId)).catch(() => null),
    );
    if (need.length && fetched.every((x) => !x) && !old.size) throw new Error('O Gmail não respondeu. Tente de novo em instantes.');
    const byId = new Map(fetched.filter(Boolean).map((r) => [r!.id, r!]));
    const rows = listed.map((t) => byId.get(t.id) ?? old.get(t.id)).filter(Boolean) as Row[];
    if (!q && !pageToken) { mem[sec] = rows; if (sec === 'inbox') saveDisk(); }
    return rows;
  };

  const modify = (id: string, add: string[], remove: string[]) =>
    g(`/threads/${id}/modify`, { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove } });

  return {
    kind: 'gmail',
    account: me,
    list: (sec, q) => list(sec, q),
    hasMore: () => !!nextTok,
    more: (sec, q) => (nextTok ? list(sec, q, nextTok) : Promise.resolve([])),
    async cached(sec) { await loadDisk(); return mem[sec] ?? null; },
    async counts() {
      const [inbox, draft, trash] = await Promise.all([g('/labels/INBOX'), g('/labels/DRAFT'), g('/labels/TRASH')]);
      return { inbox: inbox.threadsUnread ?? 0, rascunhos: draft.threadsTotal ?? 0, lixeira: trash.threadsTotal ?? 0 };
    },
    async thread(row) {
      const t = await g(`/threads/${row.id}?format=full`);
      return Promise.all((t.messages as any[]).map(async (m): Promise<Msg> => {
        const from = parseAddr(header(m, 'From'));
        let html = findPart(m.payload, 'text/html') ?? undefined;
        if (html && /cid:/i.test(html)) {
          const imgs = await inlineImages(m);
          html = html.replace(/cid:([^"'\s)>]+)/gi, (all, id) => imgs[decodeURIComponent(id)] ?? imgs[id] ?? all);
        }
        return {
          id: m.id, name: from.name, email: from.email, to: header(m, 'To'),
          date: fmtDateLong(Number(m.internalDate)), text: bodyText(m.payload), html, files: collectFiles(m),
          unsubscribe: header(m, 'List-Unsubscribe') || undefined,
          ...parseInvite(findPart(m.payload, 'text/calendar'), self),
          messageIdHeader: header(m, 'Message-ID') || header(m, 'Message-Id'), mine: from.email === self.toLowerCase(),
        };
      }));
    },
    /** responde a um convite pela API da Agenda (precisa da permissão "calendar.events") */
    async rsvp(uid, answer) {
      const headers = { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' };
      const cal = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
      const r = await fetch(`${cal}?iCalUID=${encodeURIComponent(uid)}`, { headers });
      if (r.status === 403 || r.status === 401) throw new Error('sem-permissao');
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error?.message ?? `Agenda ${r.status}`);
      const ev = j?.items?.[0];
      if (!ev) throw new Error('Esse evento não está na sua agenda.');
      const attendees = (ev.attendees ?? []).map((a: any) => (a.self ? { ...a, responseStatus: answer } : a));
      const u = await fetch(`${cal}/${ev.id}?sendUpdates=all`, { method: 'PATCH', headers, body: JSON.stringify({ attendees }) });
      if (!u.ok) throw new Error(`Agenda ${u.status}`);
    },
    archive: (row) => modify(row.id, [], ['INBOX']),
    async autoArchive(days) {
      const q = encodeURIComponent(`in:inbox -is:unread -is:starred -is:important older_than:${days}d`);
      const j = await g(`/threads?q=${q}&maxResults=50`);
      const th: { id: string }[] = j?.threads ?? [];
      await pool(th, 3, (t) => modify(t.id, [], ['INBOX']));
      return th.length;
    },
    trash: (row) => g(`/threads/${row.id}/trash`, { method: 'POST' }),
    async restore(row) {
      await g(`/threads/${row.id}/untrash`, { method: 'POST' }).catch(() => null);
      await modify(row.id, ['INBOX'], []);
    },
    async block(row) {
      await g('/settings/filters', {
        method: 'POST',
        body: { criteria: { from: row.email }, action: { addLabelIds: ['TRASH'], removeLabelIds: ['INBOX'] } },
      });
      // joga na lixeira o que esse remetente já mandou
      const j = await g(`/threads?q=${encodeURIComponent(`from:${row.email} in:inbox`)}&maxResults=50`);
      await pool((j?.threads ?? []) as any[], 5, (t) => g(`/threads/${t.id}/trash`, { method: 'POST' }));
    },
    async unblock(row) {
      await g(`/settings/filters/${row.id}`, { method: 'DELETE' });
    },
    async setUnread(row, unread) {
      await modify(row.id, unread ? ['UNREAD'] : [], unread ? [] : ['UNREAD']);
    },
    async send(d) {
      await g('/messages/send', { method: 'POST', body: { raw: buildRaw(d), threadId: d.threadId } });
      if (d.id) await g(`/drafts/${d.id}`, { method: 'DELETE' }).catch(() => null);
    },
    async saveDraft(d) {
      const message = { raw: buildRaw(d), threadId: d.threadId };
      if (d.id) await g(`/drafts/${d.id}`, { method: 'PUT', body: { message } });
      else await g('/drafts', { method: 'POST', body: { message } });
    },
    async deleteDraft(d) {
      if (d.id) await g(`/drafts/${d.id}`, { method: 'DELETE' });
    },
    async photos() {
      const out: Record<string, string> = {};
      const take = (people: any[] | undefined) => {
        for (const p of people ?? []) {
          const nm = p.names?.[0]?.displayName ?? '';
          addContacts((p.emailAddresses ?? []).map((e: any) => ({ name: nm, email: String(e.value ?? '') })));
          const ph = (p.photos ?? []).find((x: any) => x.url && !x.default);
          if (!ph) continue;
          for (const e of p.emailAddresses ?? []) if (e.value) out[String(e.value).toLowerCase()] = ph.url;
        }
      };
      const get = async (url: string) => {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${await getAccessToken()}` } });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(r.status === 403 ? 'sem-permissao' : j?.error?.message ?? `Contatos ${r.status}`);
        return j;
      };
      const walk = async (base: string, key: 'connections' | 'otherContacts') => {
        let token = '';
        for (let page = 0; page < 5; page++) {
          const j = await get(base + (token ? `&pageToken=${token}` : ''));
          take(j[key]);
          token = j.nextPageToken ?? '';
          if (!token) break;
        }
      };
      await walk('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,photos&pageSize=1000', 'connections');
      await walk('https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses,photos&pageSize=1000', 'otherContacts').catch(() => {});
      return out;
    },
    async attachment(f) {
      const j = await g(`/messages/${f.msgId}/attachments/${f.id}`);
      const uri = `${FS.cacheDirectory}${f.name.replace(/[^\w.\-]+/g, '_')}`;
      await FS.writeAsStringAsync(uri, b64urlToB64(j.data), { encoding: FS.EncodingType.Base64 });
      return uri;
    },
  };
}
