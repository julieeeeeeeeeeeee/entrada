// Provider real: fala com a API do Gmail.
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
      await sleep(1500 * (4 - tries));
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
    const j = await g(`/threads?${params}`);
    const ids: string[] = (j?.threads ?? []).map((t: any) => t.id);
    const threads = await pool(ids, 4, (id) =>
      g(`/threads/${id}?format=full&fields=${encodeURIComponent(LIST_FIELDS)}`).catch(() => null),
    );
    if (ids.length && threads.every((t) => !t)) throw new Error('O Gmail não respondeu. Tente de novo em instantes.');
    return threads.filter(Boolean).map((t) => threadToRow(t, sec, self));
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
          messageIdHeader: header(m, 'Message-ID') || header(m, 'Message-Id'), mine: from.email === self.toLowerCase(),
        };
      }));
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
    async photos() {
      const out: Record<string, string> = {};
      const take = (people: any[] | undefined) => {
        for (const p of people ?? []) {
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
      await walk('https://people.googleapis.com/v1/people/me/connections?personFields=emailAddresses,photos&pageSize=1000', 'connections');
      await walk('https://people.googleapis.com/v1/otherContacts?readMask=emailAddresses,photos&pageSize=1000', 'otherContacts').catch(() => {});
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
