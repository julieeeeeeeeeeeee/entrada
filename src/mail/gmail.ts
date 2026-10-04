// Provider real: fala com a API do Gmail.
import * as FS from 'expo-file-system/legacy';
import { classify } from '../classify';
import type { Account, Draft, FileRef, Msg, Provider, Row, Section } from '../types';
import { b64urlEncode, b64encode, b64urlToB64, b64urlToString, fmtDateLong, fmtTime, parseAddr, stripHtml, utf8Encode } from '../util';
import { getAccessToken, userInfo } from './auth';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function g(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const r = await fetch(BASE + path, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message ?? `Gmail ${r.status}`);
  return j;
}

// só traz o que a lista precisa (sem o corpo dos e-mails)
const PART = 'mimeType,filename,body(size,attachmentId)';
const LIST_FIELDS = `id,messages(id,labelIds,internalDate,snippet,payload(headers,${PART},parts(${PART},parts(${PART},parts(${PART}))))))`;

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

function bodyText(p: any): string {
  if (!p) return '';
  const find = (x: any, mime: string): string | null => {
    if (x.mimeType === mime && x.body?.data) return b64urlToString(x.body.data);
    for (const c of x.parts ?? []) {
      const r = find(c, mime);
      if (r !== null) return r;
    }
    return null;
  };
  return find(p, 'text/plain') ?? (find(p, 'text/html') !== null ? stripHtml(find(p, 'text/html')!) : '');
}

function threadToRow(t: any, sec: Section, self: string): Row {
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

export function createGmailProvider(): Provider {
  let self = '';
  const me = async (): Promise<Account> => {
    const a = await userInfo();
    self = a.email;
    return a;
  };

  const list = async (sec: Section, q?: string): Promise<Row[]> => {
    if (!self) await me();
    if (sec === 'rascunhos') {
      const j = await g('/drafts?maxResults=30');
      const drafts: any[] = j?.drafts ?? [];
      return pool(drafts, 6, async (d) => {
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
    const params = new URLSearchParams({ maxResults: '30' });
    let query = q ?? '';
    if (sec === 'inbox') params.append('labelIds', 'INBOX');
    if (sec === 'enviados') params.append('labelIds', 'SENT');
    if (sec === 'lixeira') { params.append('labelIds', 'TRASH'); params.set('includeSpamTrash', 'true'); }
    if (sec === 'arquivados') query = `-in:inbox -in:sent -in:trash -in:spam -in:drafts ${query}`.trim();
    if (query) params.set('q', query);
    const j = await g(`/threads?${params}`);
    const ids: string[] = (j?.threads ?? []).map((t: any) => t.id);
    const threads = await pool(ids, 6, (id) => g(`/threads/${id}?format=full&fields=${encodeURIComponent(LIST_FIELDS)}`));
    return threads.map((t) => threadToRow(t, sec, self));
  };

  const modify = (id: string, add: string[], remove: string[]) =>
    g(`/threads/${id}/modify`, { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove } });

  return {
    kind: 'gmail',
    account: me,
    list,
    async counts() {
      const [inbox, draft, trash] = await Promise.all([g('/labels/INBOX'), g('/labels/DRAFT'), g('/labels/TRASH')]);
      return { inbox: inbox.threadsUnread ?? 0, rascunhos: draft.threadsTotal ?? 0, lixeira: trash.threadsTotal ?? 0 };
    },
    async thread(row) {
      const t = await g(`/threads/${row.id}?format=full`);
      return (t.messages as any[]).map((m): Msg => {
        const from = parseAddr(header(m, 'From'));
        return {
          id: m.id, name: from.name, email: from.email, to: header(m, 'To'),
          date: fmtDateLong(Number(m.internalDate)), text: bodyText(m.payload), files: collectFiles(m),
          messageIdHeader: header(m, 'Message-ID') || header(m, 'Message-Id'), mine: from.email === self.toLowerCase(),
        };
      });
    },
    archive: (row) => modify(row.id, [], ['INBOX']),
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
    async attachment(f) {
      const j = await g(`/messages/${f.msgId}/attachments/${f.id}`);
      const uri = `${FS.cacheDirectory}${f.name.replace(/[^\w.\-]+/g, '_')}`;
      await FS.writeAsStringAsync(uri, b64urlToB64(j.data), { encoding: FS.EncodingType.Base64 });
      return uri;
    },
  };
}
