import {
  Archive, ArrowBendUpLeft, ArrowBendUpRight, CaretDown, CaretLeft, CheckCircle, DotsThree, DownloadSimple, EnvelopeSimple, Trash,
} from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Mail } from '../state';
import { C, F } from '../theme';
import type { Draft, FileRef, Msg, Row } from '../types';
import { fmtSize } from '../util';
import { fileKind } from '../ui/icons';
import { Avatar, IconBtn } from '../ui/parts';

interface Props {
  m: Mail;
  row: Row;
  onClose: () => void;
  onCompose: (d: Partial<Draft>) => void;
  onFile: (f: FileRef) => void;
  onSaveAll: (files: FileRef[]) => Promise<void>;
  saved: Set<string>;
}

export function Reader({ m, row, onClose, onCompose, onFile, onSaveAll, saved }: Props) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    m.openThread(row).then(setMsgs).catch((e) => setErr(String(e?.message ?? e)));
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = msgs?.[msgs.length - 1];
  const done = (fn: () => void) => () => { fn(); onClose(); };

  const reply = () => last && onCompose({
    to: last.mine ? last.to : last.email,
    subject: /^re:/i.test(row.subject) ? row.subject : `Re: ${row.subject}`,
    body: `\n\n— ${last.name} escreveu:\n${last.text.split('\n').map((l) => `> ${l}`).join('\n')}`,
    inReplyTo: last.messageIdHeader, threadId: row.id,
  });
  const forward = () => last && onCompose({
    subject: /^enc:/i.test(row.subject) ? row.subject : `Enc: ${row.subject}`,
    body: `\n\n— Mensagem encaminhada de ${last.name}:\n${last.text}`,
  });

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.nav}>
        <IconBtn onPress={onClose}><CaretLeft size={26} color={C.tx} /></IconBtn>
        <View style={{ flexDirection: 'row' }}>
          <IconBtn onPress={done(() => m.archive(row))}><Archive size={24} color={C.tx2} /></IconBtn>
          <IconBtn onPress={done(() => m.trash(row))}><Trash size={24} color={C.tx2} /></IconBtn>
          <IconBtn onPress={done(() => m.setUnread({ ...row, unread: false }, true))}><EnvelopeSimple size={24} color={C.tx2} /></IconBtn>
          <IconBtn onPress={() => m.toast('Mais ações em breve')}><DotsThree size={26} color={C.tx2} /></IconBtn>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 130 }}>
        <Text style={s.subject}>{row.subject}</Text>
        {!msgs && !err && <ActivityIndicator color={C.sec} style={{ marginTop: 40 }} />}
        {err && <Text style={s.err}>{err}</Text>}
        {msgs && msgs.length > 1 && <Text style={s.count}>{msgs.length} e-mails nesta conversa</Text>}
        {msgs?.map((msg, i) => {
          const expanded = i === msgs.length - 1 || open[msg.id];
          return (
            <View key={msg.id} style={s.msg}>
              <Pressable style={s.who} onPress={() => setOpen((o) => ({ ...o, [msg.id]: !o[msg.id] }))}>
                <Avatar name={msg.name} cat={msg.mine ? 'pessoas' : row.cat} email={msg.email} size={44} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.name}>{msg.mine ? 'Você' : msg.name}</Text>
                    <CaretDown size={14} color={C.sec} />
                  </View>
                  <Text style={s.sub} numberOfLines={1}>{msg.date}</Text>
                </View>
              </Pressable>
              {open[msg.id] && (
                <View style={s.det}>
                  <Text style={s.detTx}><Text style={s.detK}>De  </Text>{msg.name} &lt;{msg.email}&gt;</Text>
                  <Text style={s.detTx}><Text style={s.detK}>Para  </Text>{msg.to}</Text>
                </View>
              )}
              {expanded ? (
                <>
                  {msg.files.length > 0 && <Attachments files={msg.files} saved={saved} onFile={onFile} onSaveAll={onSaveAll} />}
                  <Text style={s.body} selectable>{msg.text || '(sem texto)'}</Text>
                </>
              ) : (
                <Text style={s.snip} numberOfLines={2}>{msg.text}</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={s.bar}>
        <BarBtn label="Arquivar" onPress={done(() => m.archive(row))}><Archive size={24} color={C.tx2} /></BarBtn>
        <BarBtn label="Lixeira" onPress={done(() => m.trash(row))}><Trash size={24} color={C.tx2} /></BarBtn>
        <BarBtn label="Responder" onPress={reply}><ArrowBendUpLeft size={24} color={C.tx2} /></BarBtn>
        <BarBtn label="Encaminhar" onPress={forward}><ArrowBendUpRight size={24} color={C.tx2} /></BarBtn>
      </View>
    </SafeAreaView>
  );
}

function BarBtn({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={s.barBtn}>
      {children}
      <Text style={s.barLb}>{label}</Text>
    </Pressable>
  );
}

function Attachments({ files, saved, onFile, onSaveAll }: { files: FileRef[]; saved: Set<string>; onFile: (f: FileRef) => void; onSaveAll: (f: FileRef[]) => Promise<void> }) {
  const total = files.reduce((a, f) => a + f.size, 0);
  const all = files.every((f) => saved.has(f.id));
  return (
    <View style={{ marginBottom: 20 }}>
      <View style={s.ah}>
        <Text style={s.ahTx}>{files.length} {files.length > 1 ? 'anexos' : 'anexo'} · {fmtSize(total)}</Text>
        <Pressable disabled={all} onPress={() => onSaveAll(files.filter((f) => !saved.has(f.id)))} style={s.saveAll}>
          <Text style={[s.saveAllTx, all && { color: C.sec }]}>{all ? 'Tudo salvo' : 'Salvar tudo'}</Text>
        </Pressable>
      </View>
      {files.map((f) => {
        const k = fileKind(f.name);
        return (
          <Pressable key={f.id} style={s.fc} onPress={() => onFile(f)}>
            <View style={s.fi}><k.Icon size={22} color={C.tx2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.fn} numberOfLines={1}>{f.name}</Text>
              <Text style={s.fm}>{k.label} · {fmtSize(f.size)}</Text>
            </View>
            {saved.has(f.id) ? <CheckCircle size={22} color={C.ok} /> : <DownloadSimple size={22} color={C.sec} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, height: 60 },
  subject: { color: C.tx, fontFamily: F.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, marginTop: 6, marginBottom: 14 },
  count: { color: C.sec, fontFamily: F.semi, fontSize: 13, marginBottom: 14 },
  err: { color: '#ffb4b8', fontFamily: F.med, marginTop: 20 },
  msg: { marginBottom: 22 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  name: { color: C.tx, fontFamily: F.bold, fontSize: 15 },
  sub: { color: C.sec, fontFamily: F.med, fontSize: 13, marginTop: 2 },
  det: { backgroundColor: C.s1, borderRadius: 16, padding: 14, gap: 8, marginBottom: 16 },
  detTx: { color: C.tx, fontFamily: F.med, fontSize: 13.5 },
  detK: { color: C.sec, fontFamily: F.med },
  body: { color: '#d6d6da', fontFamily: F.reg, fontSize: 16.5, lineHeight: 26 },
  snip: { color: C.sec, fontFamily: F.reg, fontSize: 14.5, lineHeight: 21 },
  ah: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  ahTx: { color: C.sec, fontFamily: F.semi, fontSize: 13 },
  saveAll: { backgroundColor: C.s2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  saveAllTx: { color: C.tx, fontFamily: F.bold, fontSize: 13 },
  fc: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.s1, borderRadius: 18, padding: 12, marginBottom: 8 },
  fi: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3b3d47', alignItems: 'center', justifyContent: 'center' },
  fn: { color: C.tx, fontFamily: F.semi, fontSize: 14.5 },
  fm: { color: C.sec, fontFamily: F.med, fontSize: 12.5, marginTop: 1 },
  bar: { position: 'absolute', left: 16, right: 16, bottom: 24, height: 68, borderRadius: 34, backgroundColor: '#26272c', borderWidth: 1, borderColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', elevation: 10 },
  barBtn: { alignItems: 'center', gap: 4, width: 74 },
  barLb: { color: C.sec, fontFamily: F.semi, fontSize: 11 },
});
