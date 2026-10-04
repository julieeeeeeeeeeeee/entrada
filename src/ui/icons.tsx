import type { ComponentType } from 'react';
import {
  AirplaneTilt, Bank, Briefcase, ChatCircleDots, Code, File, FileDoc, FileImage, FilePdf, FileZip,
  Heartbeat, Newspaper, Package, ShieldCheck, ShoppingBag, Tag, Ticket, User,
} from 'phosphor-react-native';
import type { CatKey } from '../types';

type Icon = ComponentType<{ size?: number; color?: string; weight?: 'regular' | 'bold' | 'fill' }>;

export const CAT: Record<CatKey, { n: string; Icon: Icon }> = {
  pessoas: { n: 'Pessoas', Icon: User },
  trabalho: { n: 'Trabalho', Icon: Briefcase },
  compras: { n: 'Compras', Icon: ShoppingBag },
  entregas: { n: 'Entregas', Icon: Package },
  financeiro: { n: 'Financeiro', Icon: Bank },
  saude: { n: 'Saúde', Icon: Heartbeat },
  viagens: { n: 'Viagens', Icon: AirplaneTilt },
  eventos: { n: 'Eventos', Icon: Ticket },
  news: { n: 'Newsletters', Icon: Newspaper },
  promo: { n: 'Promoções', Icon: Tag },
  social: { n: 'Redes sociais', Icon: ChatCircleDots },
  seguranca: { n: 'Segurança', Icon: ShieldCheck },
  tec: { n: 'Tecnologia', Icon: Code },
};

export function fileKind(name: string): { label: string; Icon: Icon } {
  const e = name.split('.').pop()?.toLowerCase() ?? '';
  if (e === 'pdf') return { label: 'PDF', Icon: FilePdf };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(e)) return { label: `Imagem ${e.toUpperCase()}`, Icon: FileImage };
  if (['doc', 'docx'].includes(e)) return { label: 'Documento Word', Icon: FileDoc };
  if (['zip', 'rar', '7z'].includes(e)) return { label: 'Arquivo ZIP', Icon: FileZip };
  return { label: e ? e.toUpperCase() : 'Arquivo', Icon: File };
}
