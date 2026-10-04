// Utilitários sem dependência (base64, UTF-8, datas, endereços)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** UTF-8 -> texto. Bytes inválidos viram "�" em vez de quebrar. */
export function utf8Decode(b: number[]): string {
  let s = '';
  const cont = (k: number) => k < b.length && (b[k] & 0xc0) === 0x80;
  for (let i = 0; i < b.length; ) {
    const c = b[i++];
    if (c < 0x80) { s += String.fromCharCode(c); continue; }
    let need = 0, cp = 0;
    if (c >= 0xc2 && c < 0xe0) { need = 1; cp = c & 31; }
    else if (c >= 0xe0 && c < 0xf0) { need = 2; cp = c & 15; }
    else if (c >= 0xf0 && c < 0xf5) { need = 3; cp = c & 7; }
    else { s += '�'; continue; }
    let ok = true;
    for (let k = 0; k < need; k++) {
      if (cont(i)) cp = (cp << 6) | (b[i++] & 63);
      else { ok = false; break; }
    }
    s += ok && cp <= 0x10ffff && !(cp >= 0xd800 && cp < 0xe000) ? String.fromCodePoint(cp) : '�';
  }
  return s;
}

/** bytes -> texto, respeitando o charset declarado no e-mail (utf-8 ou latin1/windows-1252). */
export function decodeBytes(b: number[], charset = 'utf-8'): string {
  const cs = charset.toLowerCase();
  if (cs.includes('8859') || cs.includes('1252') || cs === 'latin1' || cs === 'us-ascii' || cs === 'ascii') {
    let s = '';
    for (const c of b) s += String.fromCharCode(c);
    return s;
  }
  return utf8Decode(b);
}

export function b64encode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

export function b64decode(s: string): number[] {
  const clean = s.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? B64.indexOf(clean[i + k]) : -1));
    out.push((n[0] << 2) | (n[1] >> 4));
    if (n[2] >= 0) out.push(((n[1] & 15) << 4) | (n[2] >> 2));
    if (n[3] >= 0) out.push(((n[2] & 3) << 6) | n[3]);
  }
  return out;
}

export const b64urlEncode = (bytes: number[]) =>
  b64encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const b64urlToB64 = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return t + '='.repeat((4 - (t.length % 4)) % 4);
};

export const b64urlToString = (s: string) => utf8Decode(b64decode(s));

/** "Nome <a@b.com>" -> { name, email } */
export function parseAddr(h: string): { name: string; email: string } {
  const m = h.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].split('@')[0], email: m[2].trim().toLowerCase() };
  const e = h.trim().toLowerCase();
  return { name: e.split('@')[0], email: e };
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function fmtTime(ms: number, now = Date.now()): string {
  const d = new Date(ms), n = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400000);
  const p = (x: number) => String(x).padStart(2, '0');
  if (diff <= 0) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (diff === 1) return 'Ontem';
  if (diff < 7) return DIAS[d.getDay()];
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}

export function fmtDateLong(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtSize(bytes: number): string {
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(kb))} KB`;
}

export const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';

export function stripHtml(h: string): string {
  return h
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
