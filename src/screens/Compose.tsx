import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import { TextInputWrapper } from 'expo-paste-input';
import { FileText, Paperclip, PaperPlaneTilt, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import type { Attach, Draft } from '../types';
import { fmtSize } from '../util';
import { suggest } from '../contacts';
import { getPrefs } from '../settings';
import { Avatar, IconBtn } from '../ui/parts';

const MAX_ATTACH = 3 * 1024 * 1024;

interface Props {
  initial: Partial<Draft>;
  from: string;
  onSend: (d: Draft) => void;
  onClose: (d: Draft) => void; // fecha; se tinha conteúdo, quem chamou salva como rascunho
  onInvalid: (msg: string) => void;
}

export function Compose({ initial, from, onSend, onClose, onInvalid }: Props) {
  const [to, setTo] = useState(initial.to ?? '');
  const [subject, setSubject] = useState(initial.subject ?? '');
  // a despedida já vem escrita; o cursor fica acima dela. Rascunhos salvos ficam como estavam.
  const sig = initial.id ? '' : getPrefs().signature.trim();
  const [body, setBody] = useState(() => (sig ? `\n\n${sig}${initial.body ?? ''}` : initial.body ?? ''));
  const [sel, setSel] = useState<{ start: number; end: number } | undefined>(sig ? { start: 0, end: 0 } : undefined);
  const [toFocus, setToFocus] = useState(false);
  const [atts, setAtts] = useState<Attach[]>(initial.attachments ?? []);
  const total = atts.reduce((n, a) => n + a.size, 0);

  const addAtts = (list: Attach[]) => {
    const add = list.reduce((n, a) => n + a.size, 0);
    if (total + add > MAX_ATTACH) return onInvalid('Anexos somam mais de 3 MB. Esse é o limite por enquanto.');
    setAtts((p) => [...p, ...list]);
  };
  const pickFiles = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (r.canceled) return;
      addAtts(r.assets.map((x) => ({ name: x.name, mime: x.mimeType ?? '', uri: x.uri, size: x.size ?? 0 })));
    } catch (e) { onInvalid(e instanceof Error ? e.message : 'Não consegui anexar'); }
  };
  // imagem colada pelo teclado (ex.: a captura de tela que aparece como sugestão)
  const onPaste = async (p: { type: string; uris?: string[] }) => {
    if (p.type !== 'images' || !p.uris?.length) return;
    const out: Attach[] = [];
    for (const uri of p.uris) {
      const info = await FS.getInfoAsync(uri).catch(() => null);
      const ext = (uri.split('?')[0].split('.').pop() ?? 'png').toLowerCase();
      const e = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
      out.push({ name: `imagem-${Date.now()}-${out.length + 1}.${e}`, mime: e === 'jpg' ? 'image/jpeg' : `image/${e}`, uri, size: info && info.exists ? info.size : 0 });
    }
    addAtts(out);
  };
  // texto que você está digitando agora no "Para" (depois da última vírgula)
  const part = to.split(/[,;]/).pop()!.trim();
  const sugg = useMemo(
    () => (toFocus ? suggest(part, to.toLowerCase().split(/[,;]/).map((x) => x.trim())) : []),
    [part, toFocus, to],
  );
  const pick = (name: string, email: string) => {
    const head = to.split(/[,;]/).slice(0, -1).map((x) => x.trim()).filter(Boolean);
    setTo([...head, email].join(', ') + ', ');
  };
  // só a despedida, sem mais nada, não conta como conteúdo
  const cur = (): Draft => ({ ...initial, to: to.trim().replace(/,$/, ''), subject, body: sig && body.trim() === sig ? '' : body, attachments: atts });

  const send = () => {
    const d = cur();
    if (!/\S+@\S+\.\S+/.test(d.to)) return onInvalid('Adicione um destinatário válido');
    onSend(d);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.nav}>
          <IconBtn onPress={() => onClose(cur())}><X size={24} color={C.tx} /></IconBtn>
          <Text style={s.title}>Novo e-mail</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconBtn onPress={pickFiles}><Paperclip size={24} color={C.tx2} /></IconBtn>
          <Pressable style={s.send} onPress={send}>
            <PaperPlaneTilt size={20} color="#fff" weight="fill" />
            <Text style={s.sendTx}>Enviar</Text>
          </Pressable>
          </View>
        </View>
        <View style={s.fld}><Text style={s.lb}>De</Text><Text style={s.from} numberOfLines={1}>{from}</Text></View>
        <View style={s.fld}>
          <Text style={s.lb}>Para</Text>
          <TextInput
            value={to} onChangeText={setTo} style={s.in} autoCapitalize="none" keyboardType="email-address" autoFocus={!initial.to}
            onFocus={() => setToFocus(true)} onBlur={() => setToFocus(false)}
          />
        </View>
        {sugg.length > 0 && (
          <View>
            {sugg.map((c) => (
              <Pressable key={c.email} style={({ pressed }) => [s.sug, pressed && { backgroundColor: C.s1 }]} onPress={() => pick(c.name, c.email)}>
                <Avatar name={c.name || c.email} cat="pessoas" email={c.email} size={40} />
                <View style={{ flex: 1 }}>
                  {!!c.name && <Text style={s.sugN} numberOfLines={1}>{c.name}</Text>}
                  <Text style={c.name ? s.sugE : s.sugN} numberOfLines={1}>{c.email}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <View style={s.fld}>
          <Text style={s.lb}>Assunto</Text>
          <TextInput value={subject} onChangeText={setSubject} style={s.in} />
        </View>
        {atts.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.attRow} contentContainerStyle={{ gap: 10, paddingHorizontal: 22 }}>
            {atts.map((a, i) => (
              <View key={a.uri + i} style={s.att}>
                {a.mime.startsWith('image/') ? <Image source={{ uri: a.uri }} style={s.attImg} /> : <View style={s.attImg}><FileText size={22} color={C.tx2} /></View>}
                <View style={{ maxWidth: 120 }}>
                  <Text style={s.attN} numberOfLines={1}>{a.name}</Text>
                  <Text style={s.attS}>{fmtSize(a.size)}</Text>
                </View>
                <Pressable hitSlop={8} onPress={() => setAtts((p) => p.filter((_, j) => j !== i))}><X size={16} color={C.sec} /></Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        <TextInputWrapper style={{ flex: 1 }} onPaste={onPaste}>
        <TextInput onChangeText={(v) => { setSel(undefined); setBody(v); }} selection={sel} multiline textAlignVertical="top" autoFocus={!!initial.to}
          placeholder="Escreva sua mensagem" placeholderTextColor={C.sec} style={s.body}
        />
        </TextInputWrapper>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 60 },
  title: { color: C.tx, fontFamily: F.bold, fontSize: 17 },
  send: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.ac, height: 38, paddingHorizontal: 16, borderRadius: 19, marginRight: 6 },
  sendTx: { color: '#fff', fontFamily: F.bold, fontSize: 14 },
  fld: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, height: 52, borderBottomWidth: 1, borderBottomColor: C.line },
  lb: { color: C.sec, fontFamily: F.med, fontSize: 15.5, width: 74 },
  from: { color: C.tx2, fontFamily: F.med, fontSize: 15.5, flex: 1 },
  in: { flex: 1, color: C.tx, fontFamily: F.reg, fontSize: 15.5, padding: 0 },
  sug: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 9 },
  sugN: { color: C.tx, fontFamily: F.semi, fontSize: 15 },
  sugE: { color: C.sec, fontFamily: F.reg, fontSize: 13.5 },
  attRow: { flexGrow: 0, paddingVertical: 10 },
  att: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.s1, borderRadius: 16, padding: 8, paddingRight: 12 },
  attImg: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.s2, alignItems: 'center', justifyContent: 'center' },
  attN: { color: C.tx, fontFamily: F.semi, fontSize: 13 },
  attS: { color: C.sec, fontFamily: F.med, fontSize: 11.5 },
  body: { flex: 1, color: C.tx, fontFamily: F.reg, fontSize: 16, lineHeight: 25, paddingHorizontal: 22, paddingTop: 18 },
});
