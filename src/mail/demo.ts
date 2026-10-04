// Provider de demonstração: tudo em memória, sem internet, sem login.
import type { Draft, Msg, Provider, Row, Section } from '../types';
import { fmtDateLong, fmtTime } from '../util';
import type { CatKey } from '../types';

type Where = 'inbox' | 'arquivados' | 'lixeira' | 'bloqueados';
interface Item {
  id: string; name: string; email: string; subject: string; text: string; ago: number; // minutos atrás
  unread: boolean; count: number; cat: CatKey; files: { n: string; kb: number }[]; where: Where;
}

const H = 60, D = 1440;
const seed = (): Item[] => [
  { id: 'd1', name: 'Marina Duarte', email: 'marina.duarte@gmail.com', subject: 'Adorei o case, só um ajuste!', text: 'Oi Julie! Li o case todo e achei muito forte, só queria sugerir trocar a ordem das telas na seção 3 pra contar melhor a história.', ago: 14, unread: true, count: 4, cat: 'pessoas', files: [{ n: 'case-final.pdf', kb: 3890 }], where: 'inbox' },
  { id: 'd2', name: 'Larissa', email: 'larissa@gmail.com', subject: 'A mãe perguntou do cofre', text: 'Julie, a mãe disse que o app do cofre abriu certinho hoje! Mas ela quer saber como muda a senha.', ago: 4 * H, unread: true, count: 0, cat: 'pessoas', files: [{ n: 'foto-cofre.png', kb: 2480 }], where: 'inbox' },
  { id: 'd3', name: 'Nubank', email: 'no-reply@nubank.com.br', subject: 'Sua fatura fechou', text: 'O valor da fatura de outubro é R$ 1.284,90 e o vencimento é dia 12. Você pode pagar pelo app.', ago: 5 * H, unread: true, count: 0, cat: 'financeiro', files: [{ n: 'fatura-outubro.pdf', kb: 212 }], where: 'inbox' },
  { id: 'd4', name: 'Bradesco Saúde', email: 'atendimento@bradescosaude.com.br', subject: 'Seu reembolso foi aprovado', text: 'O reembolso do protocolo 48213 foi aprovado e o valor cai em até 5 dias úteis na conta cadastrada.', ago: 5.5 * H, unread: true, count: 2, cat: 'saude', files: [{ n: 'comprovante.pdf', kb: 184 }, { n: 'protocolo-48213.pdf', kb: 96 }, { n: 'recibo-consulta.jpg', kb: 1210 }], where: 'inbox' },
  { id: 'd5', name: 'Google', email: 'no-reply@accounts.google.com', subject: 'Alerta de segurança', text: 'Um novo login foi feito na sua conta a partir de um computador Windows. Se foi você, não precisa fazer nada.', ago: 6 * H, unread: true, count: 0, cat: 'seguranca', files: [], where: 'inbox' },
  { id: 'd6', name: 'LATAM Airlines', email: 'no-reply@latam.com', subject: 'Seu check-in já está aberto', text: 'O voo para Florianópolis sai amanhã às 09:40. Faça o check-in online e escolha seu assento.', ago: 6.5 * H, unread: true, count: 0, cat: 'viagens', files: [{ n: 'cartao-embarque.pdf', kb: 148 }], where: 'inbox' },
  { id: 'd7', name: 'Rafa Monteiro', email: 'rafa.monteiro@gmail.com', subject: 'Indicação pra você', text: 'Lembrei que prometi te escrever uma indicação. Então o dia chegou, olha o texto que montei.', ago: D + 2 * H, unread: false, count: 0, cat: 'pessoas', files: [], where: 'inbox' },
  { id: 'd8', name: 'Notion', email: 'notify@mail.notion.so', subject: 'Camila convidou você pro workspace', text: 'Camila Reis convidou você para colaborar no workspace Produto 2026. Aceite o convite para ver as páginas.', ago: D + 5 * H, unread: true, count: 0, cat: 'trabalho', files: [], where: 'inbox' },
  { id: 'd9', name: 'Natura', email: 'pedidos@natura.com.br', subject: 'Seu pedido saiu para entrega', text: 'O pedido 99120 foi despachado e chega até quinta. Acompanhe pelo código de rastreio.', ago: D + 8 * H, unread: false, count: 0, cat: 'entregas', files: [], where: 'inbox' },
  { id: 'd10', name: 'Sympla', email: 'no-reply@sympla.com.br', subject: 'Seu ingresso está confirmado', text: 'Show na Fundição Progresso, sábado às 21h. Apresente o QR Code na entrada.', ago: 2 * D, unread: false, count: 0, cat: 'eventos', files: [{ n: 'ingresso.pdf', kb: 96 }], where: 'inbox' },
  { id: 'd11', name: 'Vercel', email: 'notifications@vercel.com', subject: 'Deploy de washi-plan concluído', text: 'Seu deploy em produção terminou com sucesso. Build de 41s, sem avisos.', ago: 3 * D, unread: true, count: 3, cat: 'tec', files: [], where: 'inbox' },
  { id: 'd12', name: 'Instagram', email: 'no-reply@mail.instagram.com', subject: 'Você tem 12 novos seguidores', text: 'Veja quem começou a seguir você esta semana e o que está bombando na sua conta.', ago: 4 * D, unread: false, count: 0, cat: 'social', files: [], where: 'inbox' },
  { id: 'd13', name: 'Product Hunt Radar', email: 'radar@producthunt-radar.app', subject: 'Radar da semana: 8 projetos', text: 'Esta semana: um editor colaborativo, um gerador de shaders e mais seis lançamentos.', ago: 5 * D, unread: false, count: 0, cat: 'news', files: [], where: 'inbox' },
  { id: 'd14', name: 'Shopee', email: 'no-reply@shopee.com.br', subject: 'Cupom de R$20 expira hoje', text: 'Use o cupom VOLTA20 em compras acima de R$99. Válido só até meia-noite.', ago: 12 * D, unread: true, count: 0, cat: 'promo', files: [], where: 'inbox' },
];

export function createDemoProvider(): Provider {
  const items = seed();
  const drafts: Draft[] = [
    { id: 'r1', to: 'larissa@gmail.com', subject: 'Senha do cofre', body: 'Oi Larissa, pra trocar a senha da mãe é só abrir o cofre e tocar na engrenagem.' },
    { id: 'r2', to: '', subject: 'Ideia de post', body: 'Rascunho do post sobre UX writing em apps de e-mail.' },
  ];
  const sent: Row[] = [
    { id: 's1', kind: 'mail', name: 'Marina Duarte', email: 'marina.duarte@gmail.com', subject: 'Re: Adorei o case, só um ajuste!', snippet: 'Obrigada, Marina! Vou trocar a ordem das telas e te mando a nova versão.', time: 'Ontem', unread: false, count: 0, files: [], cat: 'pessoas' },
    { id: 's2', kind: 'mail', name: 'Rafa Monteiro', email: 'rafa.monteiro@gmail.com', subject: 'Obrigada pela indicação', snippet: 'Rafa, muito obrigada! Ficou ótimo, pode mandar pra eles.', time: '28.09', unread: false, count: 0, files: [], cat: 'pessoas' },
  ];
  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));
  const toRow = (i: Item): Row => ({
    id: i.id, kind: 'mail', name: i.name, email: i.email, subject: i.subject, snippet: i.text,
    time: fmtTime(Date.now() - i.ago * 60000), ts: Date.now() - i.ago * 60000, unread: i.unread, count: i.count, cat: i.cat,
    files: i.files.map((f, k) => ({ id: `${i.id}-${k}`, msgId: i.id, name: f.n, mime: '', size: f.kb * 1024 })),
  });
  const find = (r: Row) => items.find((i) => i.id === r.id);
  const move = (r: Row, w: Where) => { const i = find(r); if (i) i.where = w; return wait(undefined); };

  return {
    kind: 'demo',
    account: () => wait({ email: 'voce@gmail.com', name: 'Você' }),
    async list(sec: Section, q?: string) {
      const has = (r: Row) => !q || `${r.name} ${r.subject} ${r.snippet}`.toLowerCase().includes(q.toLowerCase());
      let rows: Row[];
      if (sec === 'rascunhos') {
        rows = drafts.map((d) => ({ id: d.id!, kind: 'draft', name: d.to || 'Sem destinatário', email: d.to, subject: d.subject || '(sem assunto)', snippet: d.body, time: 'Ontem', unread: false, count: 0, files: [], cat: 'pessoas', draft: d }));
      } else if (sec === 'enviados') rows = sent;
      else if (sec === 'bloqueados') {
        rows = items.filter((i) => i.where === 'bloqueados').map((i) => ({ ...toRow(i), kind: 'blocked' as const, snippet: 'Remetente bloqueado' }));
      } else rows = items.filter((i) => i.where === sec).map(toRow);
      return wait(rows.filter(has));
    },
    counts: () => wait({
      inbox: items.filter((i) => i.where === 'inbox' && i.unread).length,
      rascunhos: drafts.length,
      lixeira: items.filter((i) => i.where === 'lixeira').length,
    }),
    async thread(row) {
      const i = find(row);
      const base = i ?? { text: row.snippet, ago: 60, count: 0 };
      const mk = (id: string, mine: boolean, text: string, ago: number): Msg => ({
        id, name: mine ? 'Você' : row.name, email: mine ? 'voce@gmail.com' : row.email,
        to: mine ? row.email : 'Você <voce@gmail.com>', date: fmtDateLong(Date.now() - ago * 60000), text, mine,
        files: id.endsWith('last') ? row.files : [],
      });
      const out: Msg[] = [];
      for (let k = 0; k < Math.max(0, (i?.count ?? 0) - 1); k++) {
        out.push(mk(`${row.id}-${k}`, k % 2 === 1, k % 2 ? 'Combinado, te mando até amanhã.' : base.text, base.ago + (k + 1) * 600));
      }
      out.push(mk(`${row.id}-last`, false, base.text, base.ago));
      return wait(out);
    },
    archive: (r) => move(r, 'arquivados'),
    trash: (r) => move(r, 'lixeira'),
    restore: (r) => move(r, 'inbox'),
    async block(r) { items.forEach((i) => { if (i.email === r.email) i.where = 'bloqueados'; }); return wait(undefined); },
    async unblock(r) { items.forEach((i) => { if (i.email === r.email) i.where = 'inbox'; }); return wait(undefined); },
    async setUnread(r, u) { const i = find(r); if (i) i.unread = u; return wait(undefined); },
    async send(d) {
      sent.unshift({ id: `s${Date.now()}`, kind: 'mail', name: d.to, email: d.to, subject: d.subject || '(sem assunto)', snippet: d.body, time: 'Agora', unread: false, count: 0, files: [], cat: 'pessoas' });
      const k = drafts.findIndex((x) => x.id === d.id); if (k >= 0) drafts.splice(k, 1);
      return wait(undefined);
    },
    async saveDraft(d) {
      const k = drafts.findIndex((x) => x.id === d.id);
      if (k >= 0) drafts[k] = d; else drafts.unshift({ ...d, id: `r${Date.now()}` });
      return wait(undefined);
    },
    async deleteDraft(d) { const k = drafts.findIndex((x) => x.id === d.id); if (k >= 0) drafts.splice(k, 1); return wait(undefined); },
    async attachment() { throw new Error('No modo demonstração os anexos não abrem. Entre com o Google para ver os reais.'); },
  };
}
