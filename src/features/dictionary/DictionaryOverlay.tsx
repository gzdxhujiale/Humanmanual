import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Search, X } from 'lucide-react';
import { lookupWord } from './dictionaryService';
import { DictResult } from './DictionaryWindow';
import { DictEntry } from './dictionaryTypes';
import './dictionary.css';

// ==========================================
// DictionaryOverlay — 移动端词典浮层
// 移动端没有独立词典窗口，openDictionaryWindow 在 isMobilePlatform()
// 时改走本 store；组件挂在 App 根部（仅移动端渲染），全屏覆盖展示。
// ==========================================

interface DictionaryOverlayState {
  visible: boolean;
  word: string;
  open: (word: string) => void;
  close: () => void;
}

export const useDictionaryOverlayStore = create<DictionaryOverlayState>((set) => ({
  visible: false,
  word: '',
  open: (word) => set({ visible: true, word }),
  close: () => set({ visible: false, word: '' }),
}));

type Status = 'idle' | 'loading' | 'done' | 'error';

export function DictionaryOverlay() {
  const { visible, word, close } = useDictionaryOverlayStore();
  const [input, setInput] = useState('');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const runLookup = useCallback(async (raw: string) => {
    const w = raw.trim();
    if (!w) {
      setEntry(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const result = await lookupWord(w);
      setEntry(result);
      setStatus('done');
    } catch (err) {
      setErrorMsg(typeof err === 'string' ? err : '查询失败，请稍后重试。');
      setEntry(null);
      setStatus('error');
    }
  }, []);

  // 打开或推入新词时触发查询
  useEffect(() => {
    if (!visible) return;
    setInput(word);
    if (word) void runLookup(word);
    else inputRef.current?.focus();
  }, [visible, word, runLookup]);

  if (!visible) return null;

  return (
    <div className="dict-overlay">
      <div className="dict-window dict-overlay-panel">
        <div className="dict-header">
          <span className="dict-header-title">词典查询</span>
          <div className="dict-window-controls">
            <button type="button" className="dict-window-btn close-btn" onClick={close} title="关闭" aria-label="关闭">
              <X size={16} />
            </button>
          </div>
        </div>

        <form
          className="dict-search"
          onSubmit={(e) => {
            e.preventDefault();
            void runLookup(input);
          }}
        >
          <Search size={16} className="dict-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="dict-search-input"
            value={input}
            placeholder="输入要查询的单词，回车查询"
            onChange={(e) => setInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </form>

        <div className="dict-body">
          {status === 'loading' && <div className="dict-hint">查询中…</div>}
          {status === 'error' && <div className="dict-hint dict-error">{errorMsg}</div>}
          {status === 'idle' && <div className="dict-hint">输入单词开始查询。</div>}
          {status === 'done' && entry && <DictResult entry={entry} />}
        </div>
      </div>
    </div>
  );
}
