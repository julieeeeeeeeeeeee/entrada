// Mostra o e-mail em HTML de forma segura:
//  - sem scripts (removidos + bloqueados por política de segurança do navegador)
//  - links abrem fora do app; o e-mail não consegue navegar a página
//  - imagens da internet bloqueadas até você pedir (esconde "pixels de rastreamento")
import { ImageSquare } from 'phosphor-react-native';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { C, F } from '../theme';

const HEIGHT_JS = `
(function () {
  function send() {
    var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    window.ReactNativeWebView.postMessage(String(h));
  }
  send();
  window.addEventListener('load', send);
  setTimeout(send, 300); setTimeout(send, 1200);
  if (window.ResizeObserver) new ResizeObserver(send).observe(document.body);
  true;
})();`;

/** limpeza básica: tira o que executa código ou puxa coisa de fora */
export function cleanHtml(h: string): string {
  return h
    .replace(/<(script|iframe|object|embed|form|link|meta|base|applet)\b[\s\S]*?(<\/\1>|\/?>)/gi, '')
    .replace(/<\/?(html|head|body)[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2')
    .replace(/@import[^;]+;/gi, '');
}

const hasRemote = (h: string) => /<img[^>]+src\s*=\s*["']?https?:/i.test(h) || /url\(\s*["']?https?:/i.test(h);

export function HtmlBody({ html, autoImages }: { html: string; autoImages: boolean }) {
  const [show, setShow] = useState(autoImages);
  const [height, setHeight] = useState(60);
  const remote = useMemo(() => hasRemote(html), [html]);

  const doc = useMemo(() => {
    const img = show ? "img-src data: https: http:" : 'img-src data:';
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${img}; style-src 'unsafe-inline'; font-src data:; script-src 'none'">
<style>
html,body{margin:0;padding:0;background:#fff;color:#1b1c20;font:15px/1.5 -apple-system,Roboto,Helvetica,Arial,sans-serif;overflow-wrap:anywhere;word-break:break-word}
body{padding:14px}
img{max-width:100%!important;height:auto!important}
table{max-width:100%!important}
a{color:#1a56db}
pre{white-space:pre-wrap}
</style></head><body>${cleanHtml(html)}</body></html>`;
  }, [html, show]);

  return (
    <View>
      {remote && !show && (
        <Pressable style={s.banner} onPress={() => setShow(true)}>
          <ImageSquare size={18} color={C.tx2} />
          <Text style={s.bannerTx}>Imagens bloqueadas para proteger sua privacidade</Text>
          <Text style={s.bannerBtn}>Mostrar</Text>
        </Pressable>
      )}
      <View style={s.card}>
        <WebView
          key={show ? 'img' : 'noimg'}
          originWhitelist={['*']}
          source={{ html: doc }}
          style={{ height, backgroundColor: '#fff' }}
          scrollEnabled={false}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          setSupportMultipleWindows={false}
          mixedContentMode="never"
          injectedJavaScript={HEIGHT_JS}
          onMessage={(e) => { const n = Number(e.nativeEvent.data); if (n > 0) setHeight(Math.ceil(n)); }}
          onShouldStartLoadWithRequest={(r) => {
            if (r.url === 'about:blank' || r.url.startsWith('data:') || r.url.startsWith('about:')) return true;
            Linking.openURL(r.url).catch(() => {});
            return false;
          }}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.s1, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, marginBottom: 10 },
  bannerTx: { flex: 1, color: C.sec, fontFamily: F.med, fontSize: 12.5 },
  bannerBtn: { color: C.acText, fontFamily: F.bold, fontSize: 13 },
});
