import { call } from '../../lib/tauriClient';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import { logError, logWarn } from '@humanmanual/core';
import { DictEntry } from './dictionaryTypes';

/** Single reusable label so Ctrl+L always reuses the same popup window. */
export const DICTIONARY_WINDOW_LABEL = 'dictionary_win';

/** Event fired at the dictionary window to look up a new word while it is open. */
export const DICTIONARY_LOOKUP_EVENT = 'dictionary://lookup';

export interface DictionaryLookupPayload {
  word: string;
}

/** Query the bundled ECDICT database via the Rust backend. */
export async function lookupWord(word: string): Promise<DictEntry> {
  return await call<DictEntry>('dict_lookup', { word });
}

function buildUrl(initialWord: string): string {
  const base = `${window.location.origin}/index.html?window=dictionary`;
  return initialWord ? `${base}&word=${encodeURIComponent(initialWord)}` : base;
}

/**
 * Open (or focus) the standalone dictionary window. If it is already open, the
 * new word is pushed to it via an event instead of spawning a second window.
 * On mobile there are no extra windows: the lookup opens the in-app overlay.
 */
export async function openDictionaryWindow(initialWord: string = ''): Promise<void> {
  const label = DICTIONARY_WINDOW_LABEL;
  try {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      // Bring it back into view; each step is best-effort so a denied
      // permission never blocks the actual lookup.
      await existing.show().catch(() => {});
      await existing.unminimize().catch(() => {});
      await existing.setFocus().catch(() => {});
      if (initialWord) {
        await emitTo(label, DICTIONARY_LOOKUP_EVENT, { word: initialWord });
      }
      return;
    }

    const webview = new WebviewWindow(label, {
      url: buildUrl(initialWord),
      title: '词典查询',
      width: 460,
      height: 560,
      minWidth: 360,
      minHeight: 400,
      resizable: true,
      decorations: false,
      focus: true,
      alwaysOnTop: false,
    });

    webview.once('tauri://error', (e) => {
      logError('dictionary', 'failed to create dictionary window', e);
      window.open(buildUrl(initialWord), label, 'width=460,height=560');
    });
  } catch (err) {
    logWarn('dictionary', 'Tauri WebviewWindow unavailable, falling back to window.open', err);
    window.open(buildUrl(initialWord), label, 'width=460,height=560');
  }
}
