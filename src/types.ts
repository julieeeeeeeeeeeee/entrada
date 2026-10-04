export type Section = 'inbox' | 'rascunhos' | 'enviados' | 'arquivados' | 'lixeira' | 'bloqueados';

export type CatKey =
  | 'pessoas' | 'trabalho' | 'compras' | 'entregas' | 'financeiro' | 'saude' | 'viagens'
  | 'eventos' | 'news' | 'promo' | 'social' | 'seguranca' | 'tec';

export interface FileRef {
  id: string; // attachmentId do Gmail
  msgId: string;
  name: string;
  mime: string;
  size: number; // bytes
}

/** Uma linha da lista (uma conversa, um rascunho ou um remetente bloqueado). */
export interface Row {
  id: string;
  kind: 'mail' | 'draft' | 'blocked';
  name: string;
  email: string;
  subject: string;
  snippet: string;
  time: string;
  unread: boolean;
  count: number; // quantidade de e-mails na conversa (>1 mostra o número)
  files: FileRef[];
  cat: CatKey;
  // só para rascunhos
  draft?: Draft;
}

export interface Msg {
  id: string;
  name: string;
  email: string;
  to: string;
  date: string;
  text: string;
  files: FileRef[];
  messageIdHeader?: string;
  mine?: boolean;
  html?: string; // versão HTML do e-mail (quando existe)
  unsubscribe?: string; // cabeçalho List-Unsubscribe
}

export interface Draft {
  id?: string;
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
}

export interface Account {
  email: string;
  name: string;
  picture?: string; // foto da conta do Google
}

/** Tudo que o app precisa de uma "fonte de e-mails". Há duas: demo (memória) e Gmail. */
export interface Provider {
  kind: 'demo' | 'gmail';
  account(): Promise<Account>;
  list(sec: Section, q?: string): Promise<Row[]>;
  counts(): Promise<Partial<Record<Section, number>>>;
  thread(row: Row): Promise<Msg[]>;
  archive(row: Row): Promise<void>;
  trash(row: Row): Promise<void>;
  restore(row: Row): Promise<void>;
  block(row: Row): Promise<void>;
  unblock(row: Row): Promise<void>;
  setUnread(row: Row, unread: boolean): Promise<void>;
  send(d: Draft): Promise<void>;
  saveDraft(d: Draft): Promise<void>;
  deleteDraft(d: Draft): Promise<void>;
  /** baixa o anexo e devolve o caminho local do arquivo */
  attachment(f: FileRef): Promise<string>;
  /** foto de cada contato, por e-mail (só no Gmail) */
  photos?(): Promise<Record<string, string>>;
}
