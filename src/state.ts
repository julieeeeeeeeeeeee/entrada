import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { getPrefs } from './settings';
import type { Draft, Provider, Row, Section } from './types';

export interface Bar {
  key: number;
  msg: string;
  left: number;
  secs: number;
  countdown: boolean;
  undo: () => void;
}

/**
 * Estado do app. Regra de ouro: TODA ação passa por `undoable`.
 * A tela muda na hora, mas a chamada de verdade (arquivar, enviar...) só roda
 * quando o tempo do "Desfazer" acaba. Se você desfaz, ela nunca acontece.
 */
export function useMail(provider: Provider) {
  const [sec, setSecState] = useState<Section>('inbox');
  const [query, setQueryState] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Partial<Record<Section, number>>>({});
  const [bar, setBar] = useState<Bar | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreBusy = useRef(false);

  const secRef = useRef(sec);
  const queryRef = useRef(query);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const loadId = useRef(0);
  const pending = useRef<null | (() => Promise<void> | void)>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const barKey = useRef(0);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setNote(m);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  }, []);

  const lastLoad = useRef(0);
  const load = useCallback(async (quiet = false, force = false) => {
    // voltar pro app não rebusca tudo: no máximo uma vez por minuto (puxar a lista pra baixo força)
    if (quiet && !force && Date.now() - lastLoad.current < 60_000 && rowsRef.current.length > 0) return;
    lastLoad.current = Date.now();
    const id = ++loadId.current;
    if (!quiet) {
      setLoading(true);
      // mostra na hora o que já estava guardado no celular, enquanto atualiza
      provider.cached?.(secRef.current).then((c) => { if (c && id === loadId.current && rowsRef.current.length === 0) setRows(c); }).catch(() => {});
    }
    try {
      const r = await provider.list(secRef.current, queryRef.current || undefined);
      if (id !== loadId.current) return;
      setRows(r);
      setHasMore(!!provider.hasMore?.());
      setError(null);
    } catch (e) {
      if (id === loadId.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === loadId.current) setLoading(false);
    }
    provider.counts().then(setCounts).catch(() => {});
  }, [provider]);

  useEffect(() => { load(); }, [load]);

  /** ao chegar no fim da lista, busca a próxima leva de e-mails mais antigos */
  const loadMore = useCallback(async () => {
    if (!provider.more || !provider.hasMore?.() || moreBusy.current || loadId.current === 0) return;
    moreBusy.current = true;
    setLoadingMore(true);
    const id = loadId.current;
    try {
      const r = await provider.more(secRef.current, queryRef.current || undefined);
      if (id !== loadId.current) return;
      setRows((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...r.filter((x) => !seen.has(x.id))];
      });
      setHasMore(!!provider.hasMore?.());
    } catch (e) {
      toast(`Não deu pra carregar mais: ${e instanceof Error ? e.message : e}`);
    } finally {
      moreBusy.current = false;
      setLoadingMore(false);
    }
  }, [provider, toast]);

  const setSec = (s: Section) => { secRef.current = s; setSecState(s); setRows([]); load(); };
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setQuery = (q: string) => {
    queryRef.current = q;
    setQueryState(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    // busca sozinha enquanto você digita (com pausa e a partir de 3 letras, pra não gastar a cota do Gmail)
    if (q.length === 0 || q.length >= 3) searchTimer.current = setTimeout(() => load(false, true), 800);
  };
  const search = () => { if (searchTimer.current) clearTimeout(searchTimer.current); load(false, true); };

  const flush = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    const p = pending.current;
    pending.current = null;
    setBar(null);
    if (p) {
      Promise.resolve()
        .then(p)
        .then(() => provider.counts().then(setCounts).catch(() => {}))
        .catch((e) => { toast(`Não deu certo: ${e instanceof Error ? e.message : e}`); load(true); });
    }
  }, [provider, toast, load]);

  function undoable(msg: string, commit: () => Promise<void> | void, undo: () => void, secs = 5, countdown = false) {
    flush();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    pending.current = commit;
    let left = secs;
    const key = ++barKey.current;
    const doUndo = () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null; }
      pending.current = null;
      setBar(null);
      undo();
    };
    setBar({ key, msg, left, secs, countdown, undo: doUndo });
    timer.current = setInterval(() => {
      left -= 1;
      if (left <= 0) flush();
      else setBar((b) => (b && b.key === key ? { ...b, left } : b));
    }, 1000);
  }

  // ---- ações ----
  const removeLocal = (pred: (r: Row) => boolean) => {
    const prev = rowsRef.current;
    setRows(prev.filter((r) => !pred(r)));
    return () => setRows(prev);
  };

  const archive = (row: Row) => undoable('Arquivado', () => provider.archive(row), removeLocal((r) => r.id === row.id));
  const trash = (row: Row) => undoable('Movido pra lixeira', () => provider.trash(row), removeLocal((r) => r.id === row.id));
  const restore = (row: Row) => undoable('Movido pra Entrada', () => provider.restore(row), removeLocal((r) => r.id === row.id));
  const unblock = (row: Row) => undoable(`${row.name} desbloqueado`, () => provider.unblock(row), removeLocal((r) => r.id === row.id));
  const block = (row: Row) =>
    undoable(`${row.name} bloqueado`, () => provider.block(row), removeLocal((r) => r.email === row.email));

  const setUnread = (row: Row, unread: boolean, msg?: string) => {
    const prev = rowsRef.current;
    setRows(prev.map((r) => (r.id === row.id ? { ...r, unread } : r)));
    undoable(msg ?? (unread ? 'Marcada como não lida' : 'Marcada como lida'), () => provider.setUnread(row, unread), () => setRows(prev));
  };

  /** abre uma conversa: marca como lida na hora (sem desfazer) */
  const openThread = async (row: Row) => {
    if (row.unread) {
      setRows((p) => p.map((r) => (r.id === row.id ? { ...r, unread: false } : r)));
      provider.setUnread(row, false).catch(() => {});
    }
    return provider.thread(row);
  };

  const send = (d: Draft, onUndo: () => void) =>
    undoable('Enviando', async () => { await provider.send(d); toast('E-mail enviado');
      if (d.threadId && getPrefs().archiveOnReply) { await provider.archive({ id: d.threadId } as Row).catch(() => {}); load(true, true); }
      else if (secRef.current !== 'inbox') load(true); }, onUndo, 10, true);

  const saveDraft = (d: Draft, onUndo: () => void) =>
    undoable('Rascunho salvo em Rascunhos', async () => { await provider.saveDraft(d); if (secRef.current === 'rascunhos') load(true); }, onUndo, 5);

  const deleteDraft = (d: Draft) => provider.deleteDraft(d).then(() => load(true));

  return {
    sec, setSec, query, setQuery, search, rows, loading, error, counts, bar, note, toast,
    hasMore, loadingMore, loadMore,
    load, archive, trash, restore, unblock, block, setUnread, openThread, send, saveDraft, deleteDraft, undoable,
  };
}
export type Mail = ReturnType<typeof useMail>;
