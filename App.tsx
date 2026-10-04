import {
  Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts,
} from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { deleteSaved, openFile, saveFiles } from './src/files';
import { getAccessToken, hasSession, isConfigured, signIn, signOut } from './src/mail/auth';
import { createDemoProvider } from './src/mail/demo';
import { createGmailProvider } from './src/mail/gmail';
import { Compose } from './src/screens/Compose';
import { FileViewer } from './src/screens/FileViewer';
import { Inbox } from './src/screens/Inbox';
import { Login } from './src/screens/Login';
import { Reader } from './src/screens/Reader';
import { Settings } from './src/screens/Settings';
import { useMail } from './src/state';
import { C, F } from './src/theme';
import { checkUpdate, type Release } from './src/update';
import type { Account, Draft, FileRef, Provider, Row } from './src/types';
import { Slide, Toast, UndoBar } from './src/ui/parts';

export default function App() {
  const [fontsOk] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const [provider, setProvider] = useState<Provider | null>(null);
  const [booted, setBooted] = useState(false);
  const [loginUpdate, setLoginUpdate] = useState<Release | null>(null);

  useEffect(() => {
    (async () => {
      if (isConfigured && (await hasSession())) setProvider(createGmailProvider());
      setBooted(true);
      checkUpdate().then(setLoginUpdate).catch(() => {});
    })();
  }, []);

  if (!fontsOk || !booted) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {provider ? (
          <MailApp
            provider={provider}
            onSignOut={async () => { if (provider.kind === 'gmail') await signOut(); setProvider(null); }}
          />
        ) : (
          <Login
            configured={isConfigured}
            onGoogle={async () => { await signIn(); await getAccessToken(); setProvider(createGmailProvider()); }}
            onDemo={() => setProvider(createDemoProvider())}
            update={loginUpdate}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function MailApp({ provider, onSignOut }: { provider: Provider; onSignOut: () => void }) {
  const m = useMail(provider);
  const [account, setAccount] = useState<Account | null>(null);
  const [reader, setReader] = useState<Row | null>(null);
  const [compose, setCompose] = useState<{ initial: Partial<Draft>; key: number } | null>(null);
  const [file, setFile] = useState<FileRef | null>(null);
  const [settings, setSettings] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [update, setUpdate] = useState<Release | null>(null);

  useEffect(() => { provider.account().then(setAccount).catch(() => {}); }, [provider]);
  useEffect(() => { checkUpdate().then(setUpdate).catch(() => {}); }, []);

  const openCompose = useCallback((initial: Partial<Draft> = {}) => setCompose({ initial, key: Date.now() }), []);

  const open = (r: Row) => (r.kind === 'draft' && r.draft ? openCompose(r.draft) : r.kind === 'mail' ? setReader(r) : undefined);

  const closeCompose = useCallback((d: Draft) => {
    setCompose(null);
    if (d.to || d.subject || d.body.trim()) m.saveDraft(d, () => openCompose(d));
  }, [m, openCompose]);

  const sendCompose = (d: Draft) => {
    setCompose(null);
    m.send(d, () => openCompose(d));
  };

  const markSaved = (ids: string[], on: boolean) =>
    setSaved((p) => { const n = new Set(p); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });

  const saveAll = async (files: FileRef[]) => {
    try {
      const uris = await saveFiles(provider, files);
      const ids = files.map((f) => f.id);
      markSaved(ids, true);
      m.undoable(`${files.length} ${files.length > 1 ? 'anexos salvos' : 'anexo salvo'}`, () => {}, () => { deleteSaved(uris); markSaved(ids, false); });
    } catch (e) {
      m.toast(e instanceof Error ? e.message : 'Não consegui salvar');
    }
  };

  const openAttachment = async (f: FileRef) => {
    try { await openFile(provider, f); } catch (e) { m.toast(e instanceof Error ? e.message : 'Não consegui abrir'); }
  };

  // botão voltar do Android fecha a tela de cima
  const stack = useMemo(() => ({ file, compose, settings, reader }), [file, compose, settings, reader]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.file) { setFile(null); return true; }
      if (stack.compose) { return false; } // o Compose guarda o rascunho pelo X
      if (stack.settings) { setSettings(false); return true; }
      if (stack.reader) { setReader(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [stack]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Inbox m={m} onOpen={open} onCompose={() => openCompose()} onSettings={() => setSettings(true)} />

      {reader && (
        <Slide>
          <Reader
            m={m} row={reader} saved={saved} onClose={() => setReader(null)}
            onCompose={openCompose} onFile={setFile} onSaveAll={saveAll}
          />
        </Slide>
      )}
      {settings && (
        <Slide>
          <Settings account={account} demo={provider.kind === 'demo'} found={update} onClose={() => setSettings(false)} onSignOut={onSignOut} />
        </Slide>
      )}
      {compose && (
        <Slide from="bottom">
          <Compose
            key={compose.key} initial={compose.initial} from={account?.email ?? ''}
            onSend={sendCompose} onClose={closeCompose} onInvalid={m.toast}
          />
        </Slide>
      )}
      {file && (
        <Slide from="bottom">
          <FileViewer
            file={file} saved={saved.has(file.id)} onClose={() => setFile(null)} onOpen={openAttachment}
            onSave={async (f) => saveAll([f])}
          />
        </Slide>
      )}

      {update && !settings && !reader && !compose && !file && !m.bar && (
        <Pressable onPress={() => setSettings(true)} style={{ position: 'absolute', left: 16, right: 108, bottom: 44, backgroundColor: C.s2, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 8 }}>
          <Text style={{ color: C.tx, fontFamily: F.semi, fontSize: 14 }}>Nova versão {update.version}</Text>
          <Text style={{ color: C.acText, fontFamily: F.bold, fontSize: 14 }}>Atualizar</Text>
        </Pressable>
      )}
      <UndoBar bar={m.bar} />
      <Toast note={m.note} />
    </View>
  );
}
