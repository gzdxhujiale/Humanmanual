import { useHotkeys } from 'react-hotkeys-hook';
import { openDictionaryWindow } from './dictionaryService';

/** Extract the first English word from a blob of text. */
function firstWord(text: string): string {
  const match = text.match(/[A-Za-z][A-Za-z'-]*/);
  return match ? match[0] : '';
}

/**
 * Best-effort guess of the word the user wants to look up:
 * 1. the current in-app text selection, then
 * 2. the system clipboard.
 */
async function resolveInitialWord(): Promise<string> {
  const selection = window.getSelection?.()?.toString().trim() ?? '';
  const fromSelection = firstWord(selection);
  if (fromSelection) return fromSelection;

  try {
    const clip = await navigator.clipboard.readText();
    return firstWord(clip.trim());
  } catch {
    return '';
  }
}

/**
 * Registers the Ctrl+L shortcut. Pressing it opens (or focuses) the standalone
 * dictionary window, pre-filled with the selected/clipboard word when available.
 */
export function useDictionaryHotkey(): void {
  useHotkeys(
    'ctrl+l',
    (event) => {
      event.preventDefault();
      void resolveInitialWord().then((word) => openDictionaryWindow(word));
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  );
}
