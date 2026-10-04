import { LinearGradient } from 'expo-linear-gradient';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { Bar } from '../state';
import { C, F } from '../theme';
import type { CatKey } from '../types';
import { initials } from '../util';
import { CAT } from './icons';

const PAL: [string, string][] = [
  ['#f472b6', '#be185d'], ['#fb923c', '#c2410c'], ['#fbbf24', '#b45309'], ['#34d399', '#047857'],
  ['#2dd4bf', '#0f766e'], ['#38bdf8', '#0369a1'], ['#a78bfa', '#5b21b6'], ['#94a3b8', '#334155'],
];

const SECOND = new Set(['com', 'org', 'net', 'gov', 'edu']);
function rootDomain(email: string): string {
  const d = email.split('@')[1]?.toLowerCase();
  if (!d) return '';
  const p = d.split('.');
  if (p.length <= 2) return d;
  return p[p.length - 1].length === 2 && SECOND.has(p[p.length - 2]) ? p.slice(-3).join('.') : p.slice(-2).join('.');
}
const failed = new Set<string>(); // fontes de imagem que não existem (evita tentar de novo)
const hashes = new Map<string, string>();

/**
 * Foto do remetente. Pessoa: Gravatar (se a pessoa tiver). Empresa: logo do site dela.
 * Sem imagem: pessoa = iniciais coloridas, empresa = ícone cinza da categoria.
 */
export function Avatar({ name, cat, email = '', size = 46 }: { name: string; cat: CatKey; email?: string; size?: number }) {
  const person = cat === 'pessoas';
  const [uri, setUri] = useState<string | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    let alive = true;
    setUri(null);
    if (!email) return;
    if (person) {
      const e = email.trim().toLowerCase();
      const known = hashes.get(e);
      const done = (h: string) => { if (alive) setUri(`https://gravatar.com/avatar/${h}?s=160&d=404`); };
      if (known) done(known);
      else Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, e).then((h) => { hashes.set(e, h); done(h); }).catch(() => {});
    } else {
      const d = rootDomain(email);
      if (d) setUri(`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${d}&size=128`);
    }
    return () => { alive = false; };
  }, [email, person]);

  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const colors = person ? PAL[h % PAL.length] : (['#4b4e5a', '#31333c'] as [string, string]);
  const Icon = CAT[cat].Icon;
  const base = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const };

  if (uri && !failed.has(uri)) {
    return (
      <View style={[base, { backgroundColor: person ? C.s2 : '#fff', alignItems: 'center', justifyContent: 'center' }]}>
        <Image
          source={{ uri }}
          onError={() => { failed.add(uri); bump((n) => n + 1); }}
          style={person ? { width: size, height: size } : { width: size * 0.62, height: size * 0.62 }}
          resizeMode={person ? 'cover' : 'contain'}
        />
      </View>
    );
  }
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[base, { alignItems: 'center', justifyContent: 'center' }]}>
      {person
        ? <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: size * 0.33 }}>{initials(name)}</Text>
        : <Icon size={size * 0.48} color="#d9dce4" />}
    </LinearGradient>
  );
}

export function IconBtn({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}>
      {children}
    </Pressable>
  );
}

export function UndoBar({ bar }: { bar: Bar | null }) {
  const w = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!bar) return;
    w.setValue(1);
    Animated.timing(w, { toValue: 0, duration: bar.secs * 1000, easing: Easing.linear, useNativeDriver: false }).start();
  }, [bar?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!bar) return null;
  return (
    <View style={s.undo}>
      <Text style={s.undoMsg} numberOfLines={1}>{bar.countdown ? `${bar.msg} · ${bar.left}s` : bar.msg}</Text>
      <Pressable onPress={bar.undo} hitSlop={8}><Text style={s.undoBtn}>Desfazer</Text></Pressable>
      <Animated.View style={[s.undoBar, { width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

export function Toast({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <View style={s.toast} pointerEvents="none">
      <Text style={s.toastTx}>{note}</Text>
    </View>
  );
}

/** Tela que entra deslizando por cima (leitura, escrever, anexo...). */
export function Slide({ children, from = 'right' }: { children: ReactNode; from?: 'right' | 'bottom' }) {
  const t = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t]);
  const tr = from === 'right'
    ? { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }
    : { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 900] }) };
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, transform: [tr] }]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  undo: { position: 'absolute', left: 16, right: 16, bottom: 112, backgroundColor: '#2d2e34', borderRadius: 18, paddingVertical: 14, paddingLeft: 18, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.line, zIndex: 80, elevation: 12 },
  undoMsg: { flex: 1, color: C.tx, fontFamily: F.semi, fontSize: 14 },
  undoBtn: { color: C.acText, fontFamily: F.bold, fontSize: 14, padding: 8 },
  undoBar: { position: 'absolute', left: 0, bottom: 0, height: 3, backgroundColor: C.acText },
  toast: { position: 'absolute', left: 24, right: 24, bottom: 112, alignItems: 'center', zIndex: 90 },
  toastTx: { backgroundColor: C.tx, color: '#111', fontFamily: F.semi, fontSize: 14, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 99, overflow: 'hidden', textAlign: 'center' },
});
