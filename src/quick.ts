// Acha, dentro de um e-mail, o que costuma ser usado na hora: código de verificação e link de acesso.
import type { Msg } from './types';

export interface Quick {
  codes: string[];
  links: { url: string; label: string }[];
}

const WORDS = /(verif|confirm|reset|redefin|sign.?in|log.?in|entrar|acess|magic|ativ|activate|senha|password|accept|aceitar|continuar)/i;
const NOT = /(unsubscribe|cancelar|descadastr|privacy|privacidade|terms|termos|help|ajuda|preferences)/i;

const strip = (h: string) =>
  h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');

export function quickOf(msg: Msg): Quick {
  const text = msg.text && msg.text.trim().length > 20 ? msg.text : msg.html ? strip(msg.html) : msg.text ?? '';
  const codes: string[] = [];
  const add = (c: string) => { const v = c.trim(); if (v && !codes.includes(v)) codes.push(v); };

  // "seu código é 123456", "verification code: 4F8K2A", "código de acesso 123 456"
  const near = /(?:c[oó]digo|code|verifica[cç][aã]o|verification|senha|otp|pin|token)[^\n0-9A-Za-z]{0,40}?([0-9]{3}[ -][0-9]{3}|[A-Z0-9]{4,8}|[0-9]{4,8})(?![A-Za-z0-9])/gi;
  for (const m of text.matchAll(near)) if (/\d/.test(m[1]) && !/^(19|20)\d\d$/.test(m[1])) add(m[1]);
  // linha só com o código
  if (codes.length === 0 && WORDS.test(msg.text + (msg.html ?? '')) ) {
    for (const l of text.split('\n')) if (/^\s*[0-9]{4,8}\s*$/.test(l)) add(l);
  }

  const links: Quick['links'] = [];
  const addLink = (url: string, label: string) => {
    if (!/^https?:/i.test(url) || NOT.test(url) || NOT.test(label)) return;
    if (!WORDS.test(url) && !WORDS.test(label)) return;
    if (!links.some((x) => x.url === url)) links.push({ url, label: label.replace(/\s+/g, ' ').trim() });
  };
  if (msg.html) {
    for (const m of msg.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) addLink(m[1].replace(/&amp;/g, '&'), strip(m[2]));
  }
  if (links.length === 0) {
    for (const m of text.matchAll(/(https?:\/\/[^\s<>")]+)/g)) {
      const line = text.slice(Math.max(0, (m.index ?? 0) - 120), m.index);
      addLink(m[1], line);
    }
  }
  return { codes: codes.slice(0, 2), links: links.slice(0, 2) };
}
