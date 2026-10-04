import { PaperPlaneTilt, X } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import type { Draft } from '../types';
import { suggest } from '../contacts';
import { getPrefs } from '../settings';
import { Avatar, IconBtn } from '../ui/parts';

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
  const cur = (): Draft => ({ ...initial, to: to.trim().replace(/,$/, ''), subject, body: sig && body.trim() === sig ? '' : body });

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
          <Pressable style={s.send} onPress={send}>
            <PaperPlaneTilt size={20} color="#fff" weight="fill" />
            <Text style={s.sendTx}>Enviar</Text>
          </Pressable>
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
        <TextInput
          value={body} onChangeText={(v) => { setSel(undefined); setBody(v); }} selection={sel} multiline textAlignVertical="top" autoFocus={!!initial.to}
          placeholder="Escreva sua mensagem" placeholderTextColor={C.sec} style={s.body}
        />
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
  body: { flex: 1, color: C.tx, fontFamily: F.reg, fontSize: 16, lineHeight: 25, paddingHorizontal: 22, paddingTop: 18 },
});
