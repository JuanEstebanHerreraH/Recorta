// Entrada de archivos: arrastrar, pegar o elegir. Una imagen va al editor; varias, al lote.
import { openImage } from './actions';
import { addBatchFiles } from './batch';
import { useStore } from './store';

const IMAGE_NAME = /\.(png|jpe?g|webp|avif|gif|bmp)$/i;

export function imageFiles(list: FileList | null): File[] {
  if (!list) return [];
  return Array.from(list).filter((file) => file.type.startsWith('image/') || IMAGE_NAME.test(file.name));
}

export function handleFiles(files: File[]): void {
  if (files.length === 0) return;
  const state = useStore.getState();
  if (state.mode === 'lote' || files.length > 1) {
    addBatchFiles(files);
    useStore.setState({ mode: 'lote' });
    return;
  }
  void openImage(files[0]);
}
