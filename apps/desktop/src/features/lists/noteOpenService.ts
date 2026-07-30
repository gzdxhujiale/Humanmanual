import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { usePreferencesStore } from '../settings/preferencesStore';

export type NoteOpenMode = 'sidebar' | 'window';

export const NOTE_OPEN_MODE_KEY = 'lists-note-open-mode';

export function getNoteOpenMode(): NoteOpenMode {
  const mode = usePreferencesStore.getState().getPreference(NOTE_OPEN_MODE_KEY, 'sidebar');
  return mode === 'window' ? 'window' : 'sidebar';
}

export async function setNoteOpenMode(mode: NoteOpenMode): Promise<void> {
  await usePreferencesStore.getState().setPreference(NOTE_OPEN_MODE_KEY, mode);
}

export async function openNoteInNewWindow(noteId: string, title: string = '笔记编辑') {
  // Tauri window labels must only contain alphanumeric characters, underscores, and hyphens
  const safeLabel = `note_win_${noteId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  try {
    // Check if a window with this label already exists
    const existingWindow = await WebviewWindow.getByLabel(safeLabel);
    if (existingWindow) {
      await existingWindow.setFocus();
      return;
    }

    const currentOrigin = window.location.origin;
    const url = `${currentOrigin}/index.html?window=note&noteId=${encodeURIComponent(noteId)}`;

    const webview = new WebviewWindow(safeLabel, {
      url,
      title: title || '笔记编辑',
      width: 820,
      height: 680,
      minWidth: 500,
      minHeight: 400,
      resizable: true,
      decorations: false,
      focus: true,
    });

    webview.once('tauri://created', () => {
      console.log(`Note window created for noteId: ${noteId}`);
    });

    webview.once('tauri://error', (e) => {
      console.error(`Failed to create note window for noteId: ${noteId}`, e);
      // Fallback if Tauri WebviewWindow fails
      window.open(url, safeLabel, 'width=820,height=680');
    });
  } catch (err) {
    console.warn('Tauri WebviewWindow unavailable, falling back to window.open', err);
    const url = `${window.location.origin}/index.html?window=note&noteId=${encodeURIComponent(noteId)}`;
    window.open(url, safeLabel, 'width=820,height=680');
  }
}
