import { ArrowsClockwise, CaretLeft, DownloadSimple, SignOut } from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import type { Account } from '../types';
import { IconBtn } from '../ui/parts';
import { checkUpdate, currentVersion, downloadAndInstall, type Release } from '../update';

interface Props {
  account: Account | null;
  demo: boolean;
  found: Release | null; // atualização já achada ao abrir o app
  onClose: () => void;
  onSignOut: () => void;
}

export function Settings({ account, demo, found, onClose, onSignOut }: Props) {
  const [status, setStatus] = useState(found ? `Versão ${found.version} disponível.` : '');
  const [rel, setRel] = useState<Release | null>(found);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true); setStatus('Buscando…');
    try {
      const r = await checkUpdate();
      setRel(r);
      setStatus(r ? `Versão ${r.version} disponível.` : 'Você já está na versão mais recente.');
    } catch (e) {
      setStatus(`Não consegui buscar: ${e instanceof Error ? e.message : e}`);
    } finally { setBusy(false); }
  };

  const install = async () => {
    if (!rel) return;
    setBusy(true);
    try {
      await downloadAndInstall(rel, (p) => setStatus(`Baixando… ${Math.round(p * 100)}%`));
      setStatus('Pronto. Toque em "Instalar" na tela do Android.');
    } catch (e) {
      setStatus(`Não deu pra instalar: ${e instanceof Error ? e.message : e}`);
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.nav}>
        <IconBtn onPress={onClose}><CaretLeft size={26} color={C.tx} /></IconBtn>
        <Text style={s.title}>Configurações</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={s.card}>
        <Text style={s.k}>Conta</Text>
        <Text style={s.v}>{demo ? 'Modo demonstração' : account?.email || '—'}</Text>
        {!demo && !!account?.name && <Text style={s.sub}>{account.name}</Text>}
      </View>

      <View style={s.card}>
        <Text style={s.k}>Versão</Text>
        <Text style={s.v}>{currentVersion()}</Text>
        {rel ? (
          <Pressable style={[s.btn, { backgroundColor: C.ac }]} onPress={install} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <DownloadSimple size={20} color="#fff" />}
            <Text style={s.btnTx}>Baixar e instalar {rel.version}</Text>
          </Pressable>
        ) : (
          <Pressable style={s.btn} onPress={check} disabled={busy}>
            {busy ? <ActivityIndicator color={C.tx} /> : <ArrowsClockwise size={20} color={C.tx} />}
            <Text style={s.btnTx}>Buscar atualização</Text>
          </Pressable>
        )}
        {!!status && <Text style={s.status}>{status}</Text>}
        {!!rel?.notes && <Text style={s.notes}>{rel.notes}</Text>}
      </View>

      <Pressable style={[s.btn, s.out]} onPress={onSignOut}>
        <SignOut size={20} color={C.danger} />
        <Text style={[s.btnTx, { color: C.danger }]}>{demo ? 'Sair da demonstração' : 'Sair da conta'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 60, marginHorizontal: -6 },
  title: { color: C.tx, fontFamily: F.bold, fontSize: 17 },
  card: { backgroundColor: C.s1, borderRadius: 20, padding: 18, marginTop: 14, gap: 4 },
  k: { color: C.sec, fontFamily: F.semi, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  v: { color: C.tx, fontFamily: F.bold, fontSize: 18, marginTop: 4 },
  sub: { color: C.sec, fontFamily: F.med, fontSize: 13.5 },
  btn: { marginTop: 14, height: 50, borderRadius: 25, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTx: { color: C.tx, fontFamily: F.bold, fontSize: 15 },
  status: { color: C.tx2, fontFamily: F.med, fontSize: 13.5, marginTop: 10 },
  notes: { color: C.sec, fontFamily: F.reg, fontSize: 13, marginTop: 6, lineHeight: 19 },
  out: { marginTop: 22, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(229,72,77,0.4)' },
});
