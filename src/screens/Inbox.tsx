import {
  Archive, CaretDown, Gear, MagnifyingGlass, NotePencil, PaperPlaneTilt, PencilSimple, Prohibit, Trash, Tray, X,
} from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeOut, LinearTransition, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Mail } from '../state';
import { C, F } from '../theme';
import type { FileRef, Row, Section } from '../types';
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
  onFile: (f: FileRef) => void;
}

const AnimatedList = Animated.FlatList<Row>;

export function Inbox({ m, onOpen, onCompose, onSettings, onFile }: Props) {
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const title = SECS.find((x) => x[0] === m.sec)![1];

  // movimento com propósito: o botão de escrever sai da frente quando você desce a lista e volta quando sobe
  const fab = useSharedValue(1);
  const lastY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y, dy = y - lastY.value;
    if (y > 80 && dy > 8) fab.value = withTiming(0, { duration: 180 });
    else if (dy < -8 || y < 80) fab.value = withTiming(1, { duration: 200 });
    lastY.value = y;
  });
  const fabStyle = useAnimatedStyle(() => ({
    opacity: fab.value,
    transform: [{ translateY: (1 - fab.value) * 90 }, { scale: 0.85 + 0.15 * fab.value }],
  }));
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));

  const caret = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(menu ? '180deg' : '0deg', { duration: 180 }) }] }));

  const swipeRight = (r: Row) => {
    if (m.sec === 'inbox') m.archive(r);
    else if (m.sec === 'bloqueados') m.unblock(r);
    else m.restore(r);
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.hdr}>
        {searching ? (
          <Animated.View entering={FadeIn.duration(160)} style={s.search}>
            <MagnifyingGlass size={20} color={C.sec} />
            <TextInput
              autoFocus value={m.query} onChangeText={m.setQuery} onSubmitEditing={m.search}
              placeholder="Buscar e-mails" placeholderTextColor={C.sec} returnKeyType="search" style={s.input}
            />
            <IconBtn style={{ width: 32, height: 32 }} onPress={() => { m.setQuery(''); setSearching(false); m.search(); }}>
              <X size={20} color={C.sec} />
            </IconBtn>
          </Animated.View>
        ) : (
          <>
            <Pressable style={s.titleBtn} onPress={() => setMenu((v) => !v)}>
              <Text style={s.title}>{title}</Text>
              <Animated.View style={[{ marginTop: 5 }, caret]}><CaretDown size={18} color={C.sec} /></Animated.View>
            </Pressable>
            <IconBtn onPress={() => setSearching(true)}><MagnifyingGlass size={26} color={C.tx2} /></IconBtn>
            <IconBtn onPress={onSettings}><Gear size={26} color={C.tx2} /></IconBtn>
          </>
        )}
      </View>

      {m.error && (
        <Animated.View entering={FadeInDown.duration(200)}>
          <Pressable onPress={() => m.load()} style={s.err}>
            <Text style={s.errTx}>{m.error}</Text>
            <Text style={s.errBtn}>Tentar de novo</Text>
          </Pressable>
        </Animated.View>
      )}

      {m.loading && m.rows.length === 0 ? (
        <ActivityIndicator color={C.sec} style={{ marginTop: 80 }} />
      ) : (
        <AnimatedList
          data={m.rows}
          keyExtractor={(r) => r.id}
          onScroll={onScroll}
          scrollEventThrottle={16}
          itemLayoutAnimation={LinearTransition.duration(220)}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.duration(240).delay(Math.min(index, 8) * 28)} exiting={FadeOut.duration(140)}>
              <RowItem row={item} sec={m.sec} onOpen={onOpen} onRight={swipeRight} onLeft={m.block} onFile={onFile} />
            </Animated.View>
          )}
          refreshControl={<RefreshControl refreshing={m.loading} onRefresh={() => m.load(true)} tintColor={C.sec} />}
          ListEmptyComponent={!m.error ? <Animated.Text entering={FadeIn.duration(300)} style={s.empty}>{EMPTY[m.sec]}</Animated.Text> : null}
          contentContainerStyle={{ paddingBottom: 130 }}
        />
      )}

      <Animated.View style={[s.fabWrap, fabStyle]} pointerEvents="box-none">
        <Animated.View style={pressStyle}>
          <Pressable
            style={s.fab}
            onPress={onCompose}
            onPressIn={() => { press.value = withSpring(0.92, { damping: 14, stiffness: 300 }); }}
            onPressOut={() => { press.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
          >
            <PencilSimple size={28} color="#fff" />
          </Pressable>
        </Animated.View>
      </Animated.View>

      {menu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} />
          <Animated.View entering={FadeInUp.duration(170)} exiting={FadeOut.duration(110)} style={s.dd}>
            {SECS.map(([k, name, Icon], i) => {
              const n = m.counts[k];
              return (
                <Animated.View key={k} entering={FadeInUp.duration(180).delay(i * 22)}>
                  <Pressable
                    style={({ pressed }) => [s.ddItem, (k === m.sec || pressed) && { backgroundColor: C.s2 }]}
                    onPress={() => { setMenu(false); m.setSec(k); }}
                  >
                    <Icon size={22} color="#c2c5ce" />
                    <Text style={s.ddTx}>{name}</Text>
                    {!!n && <Text style={s.ddN}>{n}</Text>}
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
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
  fabWrap: { position: 'absolute', right: 22, bottom: 34 },
  fab: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.ac, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  dd: { position: 'absolute', left: 14, top: 74, width: 250, borderRadius: 22, backgroundColor: '#2d2e34', borderWidth: 1, borderColor: C.line, padding: 6, elevation: 16 },
  ddItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16 },
  ddTx: { color: C.tx, fontFamily: F.semi, fontSize: 15.5, flex: 1 },
  ddN: { color: C.sec, fontFamily: F.semi, fontSize: 13 },
});
