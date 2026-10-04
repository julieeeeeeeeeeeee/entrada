import type { CatKey } from './types';

// Primeiro olha o domínio do remetente, depois palavras do assunto, depois as categorias do próprio Gmail.
const DOMAINS: [CatKey, RegExp][] = [
  ['financeiro', /nubank|itau|bradesco\.com|inter\.co|santander|caixa\.gov|mercadopago|paypal|picpay|c6bank|xp\.com|bancobrasil/],
  ['saude', /bradescosaude|unimed|amil|sulamerica|drogasil|raia|drogaria|hapvida|dasa|fleury/],
  ['viagens', /latam|voegol|azul|booking|airbnb|uber|99app|decolar|123milhas|hoteis/],
  ['eventos', /sympla|eventbrite|ingresso|ticketmaster|bilheteria/],
  ['entregas', /correios|jadlog|loggi|rastre|totalexpress|sequoia/],
  ['compras', /natura|amazon|shopee|mercadolivre|aliexpress|magalu|magazineluiza|shein|americanas|netshoes|kabum|nuvemshop/],
  ['social', /instagram|facebook|linkedin|twitter|x\.com|tiktok|discord|pinterest|reddit|threads\.net/],
  ['seguranca', /accounts\.google|security|1password|bitwarden/],
  ['tec', /github|vercel|supabase|render\.com|expo|openai|anthropic|cloudflare|npm|stackoverflow|figma\.com|netlify/],
  ['trabalho', /notion|slack|asana|trello|miro|atlassian|zoom|calendly|clickup/],
  ['news', /substack|medium|producthunt|newsletter|beehiiv|mailchimp/],
];

const SUBJECT: [CatKey, RegExp][] = [
  ['entregas', /pedido (saiu|foi enviado|despachado)|rastreio|entrega|saiu para/i],
  ['seguranca', /alerta de segurança|novo login|código de verificação|redefin/i],
  ['financeiro', /fatura|pagamento|boleto|transferência|pix/i],
  ['viagens', /check-in|voo|passagem|reserva/i],
  ['promo', /cupom|% off|desconto|oferta|promoção/i],
];

export function classify(email: string, name: string, subject: string, labels: string[] = []): CatKey {
  const e = email.toLowerCase();
  for (const [k, re] of DOMAINS) if (re.test(e)) return k;
  for (const [k, re] of SUBJECT) if (re.test(subject)) return k;
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'promo';
  if (labels.includes('CATEGORY_SOCIAL')) return 'social';
  if (labels.includes('CATEGORY_UPDATES') || labels.includes('CATEGORY_FORUMS')) return 'news';
  if (/no-?reply|noreply|notifica|newsletter|mailer|donotreply/.test(e)) return 'news';
  return 'pessoas';
}
