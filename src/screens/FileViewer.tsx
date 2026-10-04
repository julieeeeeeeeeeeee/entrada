import { CheckCircle, DownloadSimple, ShareNetwork, X } from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import type { FileRef } from '../types';
import { fmtSize } from '../util';
import { fileKind } from '../ui/icons';
import { IconBtn } from '../ui/parts';

interface Props {
  file: FileRef;
  saved: boolean;
  onClose: () => void;
  onOpen: (f: FileRef) => Promise<void>;
  onSave: (f: FileRef) => Promise<void>;
}

export function FileViewer({ file, saved, onClose, onOpen, onSave }: Props) {
  const k = fileKind(file.name);
  const [busy, setBusy] = useState<'open' | 'save' | null>(null);
  const run = async (what: 'open' | 'save', fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); } finally { setBusy(null); }
  };
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.nav}>
        <IconBtn onPress={onClose}><X size={24} color={C.tx} /></IconBtn>
        <Text style={s.title} numberOfLines={1}>{file.name}</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={s.prev}>
        <View style={s.big}><k.Icon size={64} color={C.tx2} /></View>
        <Text style={s.kind}>{k.label}</Text>
        <Text style={s.size}>{fmtSize(file.size)}</Text>
      </View>
      <View style={s.foot}>
        <Pressable style={[s.btn, s.btnGhost]} disabled={!!busy} onPress={() => run('open', () => onOpen(file))}>
          {busy === 'open' ? <ActivityIndicator color={C.tx} /> : <ShareNetwork size={20} color={C.tx} />}
          <Text style={[s.btnTx, { color: C.tx }]}>Abrir</Text>
        </Pressable>
        <Pressable style={[s.btn, saved && { backgroundColor: C.s2 }]} disabled={!!busy || saved} onPress={() => run('save', () => onSave(file))}>
          {busy === 'save' ? <ActivityIndicator color="#111" /> : saved ? <CheckCircle size={20} color={C.ok} /> : <DownloadSimple size={20} color="#111" />}
          <Text style={[s.btnTx, saved && { color: C.sec }]}>{saved ? 'Salvo' : 'Salvar'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 60 },
  title: { flex: 1, textAlign: 'center', color: C.tx, fontFamily: F.bold, fontSize: 15 },
  prev: { flex: 1, margin: 22, borderRadius: 24, backgroundColor: C.s1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  big: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#3b3d47', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kind: { color: C.tx, fontFamily: F.bold, fontSize: 18 },
  size: { color: C.sec, fontFamily: F.med, fontSize: 14 },
  foot: { flexDirection: 'row', gap: 12, paddingHorizontal: 22, paddingBottom: 18 },
  btn: { flex: 1, height: 52, borderRadius: 26, backgroundColor: '#f5f5f5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnGhost: { backgroundColor: C.s2 },
  btnTx: { color: '#111', fontFamily: F.bold, fontSize: 15 },
});
