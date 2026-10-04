import { ArrowsClockwise, CaretLeft, DownloadSimple, SignOut } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../theme';
import type { Account } from '../types';
import { Avatar, IconBtn } from '../ui/parts';
import { photoCount } from '../photos';
import { setPref, usePrefs } from '../settings';
import { disableNotify, enableNotify, ensureRealtime, notifyEnabled, realtimeStatus } from '../notify';
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
  const prefs = usePrefs();
  const [busy, setBusy] = useState(false);
  const [notif, setNotif] = useState(false);
  const [notifMsg, setNotifMsg] = useState('');
  const [rt, setRt] = useState('');
  useEffect(() => { notifyEnabled().then(setNotif); realtimeStatus().then(setRt); }, []);
  const toggleNotif = async (on: boolean) => {
    if (on) {
      const ok = await enableNotify();
      setNotif(ok);
      setNotifMsg(ok ? '' : 'Permissão negada. Ative as notificações do Entrada nas configurações do Android.');
      setRt(await realtimeStatus());
    } else { await disableNotify(); setNotif(false); setNotifMsg(''); }
  };

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

      <View style={s.card}>
        <Text style={s.k}>Conta</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
          {!demo && !!account && <Avatar name={account.name} cat="pessoas" email={account.email} size={52} />}
          <View style={{ flex: 1 }}>
            <Text style={[s.v, { marginTop: 0 }]}>{demo ? 'Modo demonstração' : account?.email || '—'}</Text>
            {!demo && !!account?.name && <Text style={s.sub}>{account.name}</Text>}
          </View>
        </View>
      </View>

      {!demo && (
        <View style={s.card}>
          <Text style={s.k}>Fotos dos contatos</Text>
          <Text style={s.v}>{photoCount()} carregadas</Text>
          <Text style={s.sub}>{photoCount() === 0 ? 'Nenhuma ainda. Saia da conta e entre de novo, aceitando o acesso aos contatos.' : 'Vindas dos seus contatos do Google.'}</Text>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.k}>Aparência</Text>
        <View style={s.opt}>
          <View style={{ flex: 1 }}>
            <Text style={s.optT}>Agrupar por data</Text>
            <Text style={s.sub}>Separa a lista em Hoje, Ontem, Esta semana...</Text>
          </View>
          <Switch value={prefs.groupByDate} onValueChange={(v) => setPref('groupByDate', v)} trackColor={{ true: C.ac, false: C.s2 }} thumbColor="#fff" />
        </View>
        <View style={s.opt}>
          <View style={{ flex: 1 }}>
            <Text style={s.optT}>E-mails em modo escuro</Text>
            <Text style={s.sub}>Escurece a parte colorida dos e-mails.</Text>
          </View>
          <Switch value={prefs.darkEmails} onValueChange={(v) => setPref('darkEmails', v)} trackColor={{ true: C.ac, false: C.s2 }} thumbColor="#fff" />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.k}>Escrever</Text>
        <Text style={[s.optT, { marginTop: 10 }]}>Despedida</Text>
        <Text style={s.sub}>Já vem no fim de todo e-mail novo ou resposta.</Text>
        <TextInput
          value={prefs.signature} onChangeText={(v) => setPref('signature', v)} multiline textAlignVertical="top"
          placeholder={'Ex.: Abraços,\nJulie'} placeholderTextColor={C.sec} style={s.sig}
        />
      </View>

      <View style={s.card}>
        <Text style={s.k}>Arquivamento automático</Text>
        <View style={s.opt}>
          <View style={{ flex: 1 }}>
            <Text style={s.optT}>Arquivar ao responder</Text>
            <Text style={s.sub}>Depois de enviar uma resposta, a conversa sai da Entrada.</Text>
          </View>
          <Switch value={prefs.archiveOnReply} onValueChange={(v) => setPref('archiveOnReply', v)} trackColor={{ true: C.ac, false: C.s2 }} thumbColor="#fff" />
        </View>
        <View style={s.opt}>
          <View style={{ flex: 1 }}>
            <Text style={s.optT}>Arquivar e-mails antigos</Text>
            <Text style={s.sub}>Os já lidos, com mais de 30 dias, saem da Entrada (favoritos e importantes ficam).</Text>
          </View>
          <Switch value={prefs.archiveOld} onValueChange={(v) => setPref('archiveOld', v)} trackColor={{ true: C.ac, false: C.s2 }} thumbColor="#fff" />
        </View>
      </View>

      {!demo && (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.k}>Notificações</Text>
            <Switch value={notif} onValueChange={toggleNotif} trackColor={{ true: C.ac, false: C.s2 }} thumbColor="#fff" />
          </View>
          <Text style={s.sub}>Avisa de novos e-mails assim que chegam.</Text>
          {notif && <Text style={[s.sub, { color: rt === 'ok' ? C.ok : '#ffb4b8' }]}>{rt === 'ok' ? 'Em tempo real: ligado ✓' : rt ? `Em tempo real: ${rt}. Toque em Tentar de novo.` : 'Em tempo real: configurando…'}</Text>}
          {notif && rt !== 'ok' && (
            <Pressable onPress={async () => { setRt('configurando…'); setRt(await ensureRealtime(true)); }}>
              <Text style={{ color: C.acText, fontFamily: F.bold, fontSize: 13.5, marginTop: 6 }}>Tentar de novo</Text>
            </Pressable>
          )}
          {!!notifMsg && <Text style={[s.status, { color: '#ffb4b8' }]}>{notifMsg}</Text>}
        </View>
      )}

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
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 16 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 60, marginHorizontal: -6 },
  title: { color: C.tx, fontFamily: F.bold, fontSize: 17 },
  card: { backgroundColor: C.s1, borderRadius: 20, padding: 18, marginTop: 14, gap: 4 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  sig: { marginTop: 10, minHeight: 74, backgroundColor: C.s2, borderRadius: 14, padding: 12, color: C.tx, fontFamily: F.reg, fontSize: 15, lineHeight: 22 },
  optT: { color: C.tx, fontFamily: F.semi, fontSize: 15 },
  k: { color: C.sec, fontFamily: F.semi, fontSize: 12.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  v: { color: C.tx, fontFamily: F.bold, fontSize: 18, marginTop: 4 },
  sub: { color: C.sec, fontFamily: F.med, fontSize: 13.5 },
  btn: { marginTop: 14, height: 50, borderRadius: 25, backgroundColor: C.s2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  btnTx: { color: C.tx, fontFamily: F.bold, fontSize: 15 },
  status: { color: C.tx2, fontFamily: F.med, fontSize: 13.5, marginTop: 10 },
  notes: { color: C.sec, fontFamily: F.reg, fontSize: 13, marginTop: 6, lineHeight: 19 },
  out: { marginTop: 22, backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(229,72,77,0.4)' },
});
