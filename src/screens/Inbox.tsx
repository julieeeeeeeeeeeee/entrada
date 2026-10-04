import {
  Archive, CaretDown, Gear, MagnifyingGlass, NotePencil, PaperPlaneTilt, PencilSimple, Prohibit, Trash, Tray, X,
} from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Mail } from '../state';
import { C, F } from '../theme';
import type { Row, Section } from '../types';
import { IconBtn } from '../ui/parts';
import { RowItem } from '../ui/RowItem';

const SECS: [Section, string, typeof Tray][] = [
  ['inbox', 'Entrada', Tray],
  ['rascunhos', 'Rascunhos', NotePencil],
  ['enviados', 'Enviados', PaperPlaneTilt],
  ['arquivados', 'Arquivados', Archive],
  ['lixeira', 'Lixeira', Trash],
  ['bloqueados', 'Bloqueados', Prohibit],
];
const EMPTY: Record<Section, string> = {
  inbox: 'Tudo em dia.', rascunhos: 'Nenhum rascunho.', enviados: 'Nada enviado ainda.',
  arquivados: 'Nada arquivado.', lixeira: 'Lixeira vazia.', bloqueados: 'Nenhum remetente bloqueado.',
};

interface Props {
  m: Mail;
  onOpen: (r: Row) => void;
  onCompose: () => void;
  onSettings: () => void;
}

export function Inbox({ m, onOpen, onCompose, onSettings }: Props) {
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const title = SECS.find((x) => x[0] === m.sec)![1];

  const swipeRight = (r: Row) => {
    if (m.sec === 'inbox') m.archive(r);
    else if (m.sec === 'bloqueados') m.unblock(r);
    else m.restore(r);
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.hdr}>
        {searching ? (
          <View style={s.search}>
            <MagnifyingGlass size={20} color={C.sec} />
            <TextInput
              autoFocus value={m.query} onChangeText={m.setQuery} onSubmitEditing={m.search}
              placeholder="Buscar e-mails" placeholderTextColor={C.sec} returnKeyType="search" style={s.input}
            />
            <IconBtn style={{ width: 32, height: 32 }} onPress={() => { m.setQuery(''); setSearching(false); m.search(); }}>
              <X size={20} color={C.sec} />
            </IconBtn>
          </View>
        ) : (
          <>
            <Pressable style={s.titleBtn} onPress={() => setMenu((v) => !v)}>
              <Text style={s.title}>{title}</Text>
              <CaretDown size={18} color={C.sec} style={{ marginTop: 5, transform: [{ rotate: menu ? '180deg' : '0deg' }] }} />
            </Pressable>
            <IconBtn onPress={() => setSearching(true)}><MagnifyingGlass size={26} color={C.tx2} /></IconBtn>
            <IconBtn onPress={onSettings}><Gear size={26} color={C.tx2} /></IconBtn>
          </>
        )}
      </View>

      {m.error && (
        <Pressable onPress={() => m.load()} style={s.err}>
          <Text style={s.errTx}>{m.error}</Text>
          <Text style={s.errBtn}>Tentar de novo</Text>
        </Pressable>
      )}

      {m.loading && m.rows.length === 0 ? (
        <ActivityIndicator color={C.sec} style={{ marginTop: 80 }} />
      ) : (
        <FlatList
          data={m.rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RowItem row={item} sec={m.sec} onOpen={onOpen} onRight={swipeRight} onLeft={m.block} />
          )}
          refreshControl={<RefreshControl refreshing={m.loading} onRefresh={() => m.load(true)} tintColor={C.sec} />}
          ListEmptyComponent={!m.error ? <Text style={s.empty}>{EMPTY[m.sec]}</Text> : null}
          contentContainerStyle={{ paddingBottom: 130 }}
        />
      )}

      <Pressable style={s.fab} onPress={onCompose}><PencilSimple size={28} color="#fff" /></Pressable>

      {menu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} />
          <View style={s.dd}>
            {SECS.map(([k, name, Icon]) => {
              const n = m.counts[k];
              return (
                <Pressable key={k} style={[s.ddItem, k === m.sec && { backgroundColor: C.s2 }]} onPress={() => { setMenu(false); m.setSec(k); }}>
                  <Icon size={22} color="#c2c5ce" />
                  <Text style={s.ddTx}>{name}</Text>
                  {!!n && <Text style={s.ddN}>{n}</Text>}
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  hdr: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 10, height: 64, gap: 2 },
  titleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: C.tx, fontFamily: F.bold, fontSize: 30, letterSpacing: -0.9 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.s1, borderRadius: 22, paddingHorizontal: 16, height: 46 },
  input: { flex: 1, color: C.tx, fontFamily: F.reg, fontSize: 16, padding: 0 },
  err: { marginHorizontal: 16, marginBottom: 6, backgroundColor: '#3a1f22', borderRadius: 14, padding: 14, gap: 6 },
  errTx: { color: '#ffb4b8', fontFamily: F.med, fontSize: 13.5 },
  errBtn: { color: C.acText, fontFamily: F.bold, fontSize: 13.5 },
  empty: { color: C.sec, fontFamily: F.med, textAlign: 'center', marginTop: 90, fontSize: 15 },
  fab: { position: 'absolute', right: 22, bottom: 34, width: 64, height: 64, borderRadius: 20, backgroundColor: C.ac, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  dd: { position: 'absolute', left: 14, top: 74, width: 250, borderRadius: 22, backgroundColor: '#2d2e34', borderWidth: 1, borderColor: C.line, padding: 6, elevation: 16 },
  ddItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16 },
  ddTx: { color: C.tx, fontFamily: F.semi, fontSize: 15.5, flex: 1 },
  ddN: { color: C.sec, fontFamily: F.semi, fontSize: 13 },
});
