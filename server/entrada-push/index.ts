// Função do Supabase: recebe o aviso do Gmail (via Google Pub/Sub) e acorda o app Entrada
// com uma mensagem silenciosa do Firebase (FCM). Nenhum e-mail passa por aqui: só o sinal "tem novidade".
//
//   POST /entrada-push?k=<senha>   <- chamado pelo Pub/Sub quando chega e-mail
//   POST /entrada-push/register    <- o app cadastra o código do aparelho (precisa estar logado no Google)
import { createClient } from 'npm:@supabase/supabase-js@2';

const OWNER = 'julief.arruda@gmail.com'; // só esta conta pode cadastrar aparelho
const PUSH_KEY = '__PUSH_KEY__'; // senha que o Pub/Sub manda na URL (troque ao publicar)

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** token de acesso do Google para enviar FCM, a partir da chave da conta de serviço (segredo FCM_SERVICE_ACCOUNT) */
async function fcmAccessToken(sa: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud, iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`));
  const r = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token do Google: ${JSON.stringify(j)}`);
  return j.access_token;
}

async function register(req: Request): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? '';
  const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: auth } });
  if (!me.ok) return json({ error: 'login inválido' }, 401);
  if ((await me.json()).email !== OWNER) return json({ error: 'conta não autorizada' }, 403);
  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || token.length < 20) return json({ error: 'token inválido' }, 400);
  const { error } = await db.from('entrada_devices').upsert({ token, updated_at: new Date().toISOString() });
  return error ? json({ error: error.message }, 500) : json({ ok: true });
}

async function notify(): Promise<Response> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return json({ ok: false, motivo: 'FCM_SERVICE_ACCOUNT não configurado' }); // 200: não fica reenviando
  const sa = JSON.parse(raw);
  const { data: devices } = await db.from('entrada_devices').select('token');
  if (!devices?.length) return json({ ok: true, enviados: 0 });
  const access = await fcmAccessToken(sa);
  let enviados = 0;
  for (const d of devices) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: d.token, data: { type: 'new-mail' }, android: { priority: 'HIGH' } } }),
    });
    if (r.ok) enviados++;
    else if (r.status === 404 || r.status === 400) await db.from('entrada_devices').delete().eq('token', d.token); // aparelho que não existe mais
  }
  return json({ ok: true, enviados });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    if (url.pathname.endsWith('/register')) return await register(req);
    if (url.searchParams.get('k') !== PUSH_KEY) return json({ error: 'proibido' }, 403);
    return await notify();
  } catch (e) {
    console.error(e);
    return json({ ok: false, erro: String(e) }, 200);
  }
});
