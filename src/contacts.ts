// Contatos para sugerir destinatários: vêm do Google Contatos e de quem já escreveu pra você / recebeu de você.
export interface Contact { name: string; email: string }

const map = new Map<string, Contact>();

export function addContacts(list: Contact[]) {
  for (const c of list) {
    const email = c.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    const prev = map.get(email);
    // prefere o registro que tem nome de verdade
    if (!prev || (!prev.name && c.name) || (prev.name === email && c.name)) map.set(email, { name: c.name?.trim() || prev?.name || '', email });
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** até 5 sugestões: começo do nome/sobrenome primeiro, depois qualquer pedaço do nome ou e-mail */
export function suggest(q: string, skip: string[] = []): Contact[] {
  const t = norm(q.trim());
  if (t.length < 1) return [];
  const out: { c: Contact; score: number }[] = [];
  for (const c of map.values()) {
    if (skip.includes(c.email)) continue;
    const name = norm(c.name), mail = c.email;
    let score = 0;
    if (name.startsWith(t) || name.split(/\s+/).some((w) => w.startsWith(t))) score = 3;
    else if (mail.startsWith(t)) score = 2;
    else if (name.includes(t) || mail.includes(t)) score = 1;
    if (score) out.push({ c, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.c.name || a.c.email).localeCompare(b.c.name || b.c.email)).slice(0, 5).map((x) => x.c);
}
