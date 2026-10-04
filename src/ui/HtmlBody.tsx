// Mostra o e-mail em HTML de forma segura:
//  - sem scripts do e-mail (removidos + bloqueados por política de segurança do navegador)
//  - links abrem fora do app; o e-mail não consegue navegar a página
//  - imagens sempre aparecem
//  - e-mail largo demais é encolhido para caber na tela
//  - modo escuro: cada cor do e-mail é ajustada (fundo claro escurece, texto escuro clareia),
//    então e-mails que já são escuros ficam como estão e nada fica ilegível
import { useMemo, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const DARK_BG = '#141518';

// roda dentro da página do e-mail (código nosso, não do e-mail)
const PAGE_JS = (dark: boolean) => `
(function () {
  var DARK = ${dark ? 'true' : 'false'};
  var lastH = 0;

  function parse(c) {
    if (!c || c === 'transparent') return null;
    var i = c.indexOf('('); if (i < 0) return null;
    var p = c.slice(i + 1, c.indexOf(')')).split(',').map(parseFloat);
    if (p.length < 3 || isNaN(p[0])) return null;
    return [p[0], p[1], p[2], p.length > 3 && !isNaN(p[3]) ? p[3] : 1];
  }
  function lum(r, g, b) {
    var a = [r, g, b].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function ratio(l1, l2) { var a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); }
  function toHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function toRgb(h, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (!s) { var v = Math.round(l * 255); return [v, v, v]; }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function effBg(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      var b = parse(getComputedStyle(n).backgroundColor);
      if (b && b[3] >= 0.5) return b;
    }
    return [20, 21, 24, 1];
  }
  function hasText(el) {
    for (var k = el.firstChild; k; k = k.nextSibling) if (k.nodeType === 3 && k.nodeValue.trim()) return true;
    return false;
  }

  function darken() {
    var els = document.body.querySelectorAll('*'), n = Math.min(els.length, 6000);
    for (var i = 0; i < n; i++) {
      var el = els[i], tag = el.tagName;
      if (tag === 'IMG' || tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG' || tag === 'PATH' || tag === 'VIDEO') continue;
      var cs = getComputedStyle(el);
      var bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0.05 && lum(bg[0], bg[1], bg[2]) > 0.6) {
        var h = toHsl(bg[0], bg[1], bg[2]);
        var c = toRgb(h[0], h[1] * 0.7, 0.09 + (1 - h[2]) * 0.6);
        el.style.setProperty('background-color', rgb(c), 'important');
      }
      if (hasText(el)) {
        var fg = parse(cs.color), eb = effBg(el);
        if (fg) {
          var lb = lum(eb[0], eb[1], eb[2]);
          if (ratio(lum(fg[0], fg[1], fg[2]), lb) < 4.2) el.style.setProperty('color', lb < 0.4 ? (tag === 'A' ? '#7db0ff' : '#e6e6ea') : '#1b1c20', 'important');
        }
      }
    }
  }

  // e-mail mais largo que a tela: encolhe tudo para caber
  function fit() {
    var b = document.body;
    b.style.zoom = 1;
    var w = Math.max(b.scrollWidth, document.documentElement.scrollWidth), vw = window.innerWidth;
    if (vw > 50 && w > vw + 1) b.style.zoom = vw / w;
  }

  function send() {
    fit();
    var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    if (Math.abs(h - lastH) > 1) { lastH = h; window.ReactNativeWebView.postMessage(String(h)); }
  }

  try { if (DARK) darken(); } catch (e) {}
  document.body.style.opacity = 1;
  send();
  window.addEventListener('load', send);
  setTimeout(send, 300); setTimeout(send, 1200); setTimeout(send, 3000);
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

export function HtmlBody({ html, dark }: { html: string; dark: boolean }) {
  const [height, setHeight] = useState(60);

  const doc = useMemo(() => {
    // no escuro, a página começa invisível e só aparece depois do ajuste de cores (com plano B de 1,2 s)
    const darkCss = dark
      ? `html,body{background:${DARK_BG}!important;color:#e4e4e8}a{color:#7db0ff}body{opacity:0;animation:show 0s 1.2s forwards}@keyframes show{to{opacity:1}}`
      : '';
    return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:; script-src 'none'">
<style>
html{background:${dark ? DARK_BG : '#fff'}}
html,body{margin:0;padding:0;color:#1b1c20;font:15px/1.5 -apple-system,Roboto,Helvetica,Arial,sans-serif;overflow-wrap:anywhere;word-break:break-word}
body{padding:8px 6px}
img{max-width:100%!important;height:auto!important}
table{max-width:100%!important}
a{color:#1a56db}
pre{white-space:pre-wrap}
${darkCss}
</style></head><body>${cleanHtml(html)}</body></html>`;
  }, [html, dark]);

  return (
    <View style={[s.card, { backgroundColor: dark ? DARK_BG : '#fff' }]}>
      <WebView
        key={dark ? 'dark' : 'light'}
        originWhitelist={['*']}
        source={{ html: doc }}
        style={{ height, backgroundColor: dark ? DARK_BG : '#fff' }}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        injectedJavaScript={PAGE_JS(dark)}
        onMessage={(e) => { const n = Number(e.nativeEvent.data); if (n > 0) setHeight(Math.ceil(n)); }}
        onShouldStartLoadWithRequest={(r) => {
          if (r.url === 'about:blank' || r.url.startsWith('data:') || r.url.startsWith('about:')) return true;
          Linking.openURL(r.url).catch(() => {});
          return false;
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { overflow: 'hidden' },
});
