// Login com Google (OAuth com PKCE) e renovação automática do token.
// O Client ID vem de EXPO_PUBLIC_GOOGLE_CLIENT_ID (veja SETUP.md).
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
export const isConfigured = CLIENT_ID.endsWith('.apps.googleusercontent.com');

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify', // ler, arquivar, lixeira, rascunhos e enviar
  'https://www.googleapis.com/auth/gmail.settings.basic', // criar filtro para bloquear remetente
];

const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

// Cliente Android do Google usa como "redirect" o Client ID ao contrário
const scheme = `com.googleusercontent.apps.${CLIENT_ID.replace('.apps.googleusercontent.com', '')}`;
const redirectUri = `${scheme}:/oauth2redirect`;

const KEY = 'entrada.session';
interface Session { accessToken: string; refreshToken?: string; expiresAt: number }
let cache: Session | null = null;

async function save(s: Session | null) {
  cache = s;
  if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(KEY);
}

export async function hasSession(): Promise<boolean> {
  if (cache) return true;
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return false;
  cache = JSON.parse(raw) as Session;
  return true;
}

export async function signIn(): Promise<void> {
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    scopes: SCOPES,
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') throw new Error('Login cancelado');
  const tok = await AuthSession.exchangeCodeAsync(
    { clientId: CLIENT_ID, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
    discovery,
  );
  await save({
    accessToken: tok.accessToken,
    refreshToken: tok.refreshToken,
    expiresAt: Date.now() + (tok.expiresIn ?? 3600) * 1000,
  });
}

export async function getAccessToken(): Promise<string> {
  if (!(await hasSession()) || !cache) throw new Error('Não conectado');
  if (Date.now() < cache.expiresAt - 60_000) return cache.accessToken;
  if (!cache.refreshToken) throw new Error('Sessão expirada, entre de novo');
  const tok = await AuthSession.refreshAsync({ clientId: CLIENT_ID, refreshToken: cache.refreshToken }, discovery);
  await save({
    accessToken: tok.accessToken,
    refreshToken: tok.refreshToken ?? cache.refreshToken,
    expiresAt: Date.now() + (tok.expiresIn ?? 3600) * 1000,
  });
  return cache!.accessToken;
}

export async function signOut(): Promise<void> {
  try {
    if (cache?.refreshToken) await AuthSession.revokeAsync({ token: cache.refreshToken }, discovery);
  } catch {}
  await save(null);
}

export async function userInfo(): Promise<{ email: string; name: string }> {
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
  });
  const j = await r.json();
  return { email: j.email ?? '', name: j.name ?? j.email ?? '' };
}
