// Abrir e salvar anexos no celular.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { FileRef, Provider } from './types';

/** baixa o anexo e abre o seletor do Android ("abrir com...") */
export async function openFile(p: Provider, f: FileRef): Promise<void> {
  const uri = await p.attachment(f);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este aparelho não consegue abrir arquivos por aqui.');
  await Sharing.shareAsync(uri, { dialogTitle: f.name, mimeType: f.mime || undefined });
}

const DIR_KEY = 'entrada.saveDir';

/** salva na pasta que você escolher na primeira vez (lembra nas próximas). Devolve o que foi criado, pra poder desfazer. */
export async function saveFiles(p: Provider, files: FileRef[]): Promise<string[]> {
  const SAF = FS.StorageAccessFramework;
  let dir = await AsyncStorage.getItem(DIR_KEY);
  if (!dir) {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm.granted) throw new Error('Nenhuma pasta escolhida.');
    dir = perm.directoryUri;
    await AsyncStorage.setItem(DIR_KEY, dir);
  }
  const created: string[] = [];
  for (const f of files) {
    const cache = await p.attachment(f);
    const b64 = await FS.readAsStringAsync(cache, { encoding: FS.EncodingType.Base64 });
    try {
      const dest = await SAF.createFileAsync(dir, f.name, f.mime || 'application/octet-stream');
      await FS.writeAsStringAsync(dest, b64, { encoding: FS.EncodingType.Base64 });
      created.push(dest);
    } catch (e) {
      await AsyncStorage.removeItem(DIR_KEY); // pasta pode ter sido apagada: pede de novo da próxima vez
      throw e;
    }
  }
  return created;
}

export async function deleteSaved(uris: string[]): Promise<void> {
  for (const u of uris) await FS.StorageAccessFramework.deleteAsync(u).catch(() => {});
}
