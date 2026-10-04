// Pré-visualização de anexos dentro do app: imagem (com zoom) e PDF.
import * as FS from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { WebView } from 'react-native-webview';
import { C, F } from '../theme';

const clamp = (v: number, a: number, b: number) => {
  'worklet';
  return Math.min(Math.max(v, a), b);
};

/** imagem que dá pra ampliar com os dedos (pinça), arrastar e tocar duas vezes */
export function ZoomImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1), base = useSharedValue(1);
  const tx = useSharedValue(0), ty = useSharedValue(0), bx = useSharedValue(0), by = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = clamp(base.value * e.scale, 1, 5); })
    .onEnd(() => {
      base.value = scale.value;
      if (scale.value <= 1.01) { tx.value = withTiming(0); ty.value = withTiming(0); bx.value = 0; by.value = 0; }
    });
  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = bx.value + e.translationX;
      ty.value = by.value + e.translationY;
    })
    .onEnd(() => { bx.value = tx.value; by.value = ty.value; });
  const dbl = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    const to = scale.value > 1.01 ? 1 : 2.5;
    scale.value = withTiming(to, { duration: 200 });
    base.value = to;
    if (to === 1) { tx.value = withTiming(0); ty.value = withTiming(0); bx.value = 0; by.value = 0; }
  });

  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(dbl, Gesture.Simultaneous(pinch, pan))}>
      <Animated.View style={s.fill}>
        <Animated.Image source={{ uri }} resizeMode="contain" style={[s.fill, st]} />
      </Animated.View>
    </GestureDetector>
  );
}

const PDF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const MAX_PDF = 12 * 1024 * 1024;

const pdfPage = (b64: string) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>
html,body{margin:0;background:#1b1c20}
canvas{display:block;margin:8px auto;background:#fff;border-radius:4px}
#msg{color:#9a9ca6;font:15px sans-serif;text-align:center;padding:48px 24px}
</style>
<script src="${PDF_JS}"></script>
<script src="${PDF_WORKER}"></script>
</head><body><div id="msg">Carregando PDF…</div><div id="pages"></div>
<script>
(async function () {
  var msg = document.getElementById('msg');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDF_WORKER}';
    var bin = atob('${b64}'), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var pdf = await pdfjsLib.getDocument({ data: u, isEvalSupported: false }).promise;
    msg.remove();
    var w = Math.max(document.documentElement.clientWidth, 320) - 16;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var max = Math.min(pdf.numPages, 40);
    for (var p = 1; p <= max; p++) {
      var page = await pdf.getPage(p);
      var sc = w / page.getViewport({ scale: 1 }).width;
      var v = page.getViewport({ scale: sc * dpr });
      var c = document.createElement('canvas');
      c.width = v.width; c.height = v.height;
      c.style.width = (v.width / dpr) + 'px'; c.style.height = (v.height / dpr) + 'px';
      document.getElementById('pages').appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
    }
    if (pdf.numPages > max) {
      var n = document.createElement('div'); n.id = 'msg';
      n.textContent = 'Mostrando as primeiras ' + max + ' de ' + pdf.numPages + ' páginas. Use "Abrir" para ver tudo.';
      document.body.appendChild(n);
    }
  } catch (e) {
    msg.textContent = 'Não consegui mostrar este PDF aqui. Use "Abrir".';
  }
})();
</script></body></html>`;

/** PDF desenhado dentro do app (precisa de internet para carregar o leitor de PDF) */
export function PdfView({ uri }: { uri: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      const info = await FS.getInfoAsync(uri);
      if (info.exists && info.size > MAX_PDF) throw new Error('PDF grande demais para a pré-visualização. Use "Abrir".');
      const b64 = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
      if (alive) setHtml(pdfPage(b64));
    })().catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, [uri]);

  if (err) return <View style={s.center}><Text style={s.msg}>{err}</Text></View>;
  if (!html) return <View style={s.center}><ActivityIndicator color={C.sec} /></View>;
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://localhost/' }}
      style={s.pdf}
      javaScriptEnabled
      domStorageEnabled={false}
      allowFileAccess={false}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('https://localhost') || r.url.startsWith('data:')}
    />
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { color: C.sec, fontFamily: F.med, fontSize: 14.5, textAlign: 'center' },
  pdf: { flex: 1, backgroundColor: '#1b1c20' },
});
