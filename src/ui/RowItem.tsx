import { Archive, File as FileIcon, Prohibit, Tray } from 'phosphor-react-native';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { C, F } from '../theme';
import type { FileRef, Row, Section } from '../types';
import { Avatar } from './parts';

interface Props {
  row: Row;
  sec: Section;
  onOpen: (r: Row) => void;
  onRight: (r: Row) => void; // deslizar pra direita: arquivar (Entrada) ou restaurar/desbloquear
  onLeft: (r: Row) => void; // deslizar pra esquerda: bloquear (só na Entrada)
  onFile: (f: FileRef) => void; // tocar no anexo abre o arquivo
}

function Action({ color, align, children }: { color: string; align: 'left' | 'right'; children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: color, justifyContent: 'center', alignItems: align === 'left' ? 'flex-start' : 'flex-end', paddingHorizontal: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{children}</View>
    </View>
  );
}

function RowItemBase({ row, sec, onOpen, onRight, onLeft, onFile }: Props) {
  const body = (
    <Pressable onPress={() => onOpen(row)} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.s1 }]}>
      <Avatar name={row.name} cat={row.cat} email={row.email} size={42} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.l1}>
          <Text style={s.nm} numberOfLines={1}>{row.name}</Text>
          {row.count > 1 && <View style={s.th}><Text style={s.thTx}>{row.count}</Text></View>}
          <Text style={s.tm}>{row.time}</Text>
        </View>
        <View style={s.l2}>
          <Text style={[s.sj, !row.unread && s.sjRead]} numberOfLines={1}>{row.subject}</Text>
          {row.unread && <View style={s.dot} />}
        </View>
        <Text style={s.pv} numberOfLines={1}>{row.snippet}</Text>
        {row.files.length > 0 && (
          <View style={s.att}>
            <Pressable style={({ pressed }) => [s.chip, pressed && { opacity: 0.6 }]} onPress={() => onFile(row.files[0])} hitSlop={6}>
              <View style={s.chipIc}><FileIcon size={14} color="#fff" weight="fill" /></View>
              <Text style={s.chipTx} numberOfLines={1}>{row.files[0].name}</Text>
            </Pressable>
            {row.files.length > 1 && <Text style={s.more}>+{row.files.length - 1}</Text>}
          </View>
        )}
      </View>
    </Pressable>
  );

  const canArchive = sec === 'inbox';
  const canRestore = sec === 'arquivados' || sec === 'lixeira' || sec === 'bloqueados';
  if (!canArchive && !canRestore) return body;
  return (
    <ReanimatedSwipeable
      friction={1.6}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={90}
      rightThreshold={90}
      renderLeftActions={() => (
        <Action color={C.ac} align="left">
          {canArchive ? <Archive size={22} color="#fff" /> : <Tray size={22} color="#fff" />}
          <Text style={s.actTx}>{canArchive ? 'Arquivar' : sec === 'bloqueados' ? 'Desbloquear' : 'Restaurar'}</Text>
        </Action>
      )}
      renderRightActions={canArchive ? () => (
        <Action color={C.danger} align="right">
          <Text style={s.actTx}>Bloquear</Text>
          <Prohibit size={22} color="#fff" />
        </Action>
      ) : undefined}
      onSwipeableOpen={(dir) => (dir === 'left' ? onRight(row) : onLeft(row))}
    >
      {body}
    </ReanimatedSwipeable>
  );
}

export const RowItem = memo(RowItemBase);

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, paddingVertical: 11, paddingLeft: 22, paddingRight: 24, backgroundColor: C.bg },
  l1: { flexDirection: 'row', alignItems: 'center' },
  nm: { color: '#d0d0d4', fontFamily: F.med, fontSize: 13.5, flexShrink: 1 },
  th: { marginLeft: 8, minWidth: 22, height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' },
  thTx: { color: C.tx2, fontFamily: F.semi, fontSize: 12, lineHeight: 16, includeFontPadding: false, textAlignVertical: 'center' },
  tm: { marginLeft: 'auto', paddingLeft: 8, color: C.sec, fontFamily: F.med, fontSize: 12.5 },
  l2: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  sj: { flex: 1, color: C.tx, fontFamily: F.bold, fontSize: 15.5, letterSpacing: -0.2 },
  sjRead: { fontFamily: F.med, color: '#b4b4b9' },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.ac },
  pv: { color: C.sec, fontFamily: F.reg, fontSize: 13.5, marginTop: 2 },
  att: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.s1, borderRadius: 24, paddingVertical: 3, paddingLeft: 3, paddingRight: 14, maxWidth: 230 },
  chipIc: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.ac, alignItems: 'center', justifyContent: 'center' },
  chipTx: { color: C.tx, fontFamily: F.med, fontSize: 13, flexShrink: 1 },
  more: { color: C.sec, fontFamily: F.med, fontSize: 14 },
  actTx: { color: '#fff', fontFamily: F.semi, fontSize: 14 },
});
