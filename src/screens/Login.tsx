import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import { downloadAndInstall, type Release } from '../update';

interface Props {
  configured: boolean;
  onGoogle: () => Promise<void>;
  onDemo: () => void;
  update: Release | null;
}

export function Login({ configured, onGoogle, onDemo, update }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [upd, setUpd] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await onGoogle(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={s.root}>
      <View style={s.top}>
        <Text style={s.brand}>Entrada</Text>
        <Text style={s.tag}>Seu e-mail, do jeito que deveria ser.</Text>
      </View>
      <View style={s.bottom}>
        {configured ? (
          <Pressable style={s.btn} onPress={go} disabled={busy}>
            {busy ? <ActivityIndicator color="#111" /> : <Text style={s.btnTx}>Entrar com Google</Text>}
          </Pressable>
        ) : (
          <Text style={s.warn}>O login com Google ainda não foi configurado. Siga o passo a passo do arquivo SETUP.md.</Text>
        )}
        {!!err && <Text style={s.err}>{err}</Text>}
        {update && (
          <Pressable
            style={[s.btn, { backgroundColor: C.ac }]}
            onPress={() => downloadAndInstall(update, (p) => setUpd(`Baixando… ${Math.round(p * 100)}%`)).then(() => setUpd('Toque em Instalar na tela do Android.')).catch((e) => setUpd(String(e?.message ?? e)))}
          >
            <Text style={[s.btnTx, { color: '#fff' }]}>{upd || `Atualizar para a versão ${update.version}`}</Text>
          </Pressable>
        )}
        <Pressable style={[s.btn, s.ghost]} onPress={onDemo}>
          <Text style={[s.btnTx, { color: C.tx }]}>Ver demonstração</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 24, justifyContent: 'space-between' },
  top: { marginTop: 90, gap: 10 },
  brand: { color: C.tx, fontFamily: F.xbold, fontSize: 52, letterSpacing: -2 },
  tag: { color: C.sec, fontFamily: F.med, fontSize: 17, lineHeight: 24 },
  bottom: { gap: 12, paddingBottom: 12 },
  btn: { height: 54, borderRadius: 27, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: C.s2 },
  btnTx: { color: '#111', fontFamily: F.bold, fontSize: 16 },
  warn: { color: C.sec, fontFamily: F.med, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  err: { color: '#ffb4b8', fontFamily: F.med, fontSize: 13.5 },
});
