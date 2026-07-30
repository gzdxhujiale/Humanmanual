import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { Minus, Square, Copy, X, Search, Pin, Volume2 } from 'lucide-react';
import { lookupWord, DICTIONARY_LOOKUP_EVENT, DictionaryLookupPayload } from './dictionaryService';
import { DictEntry } from './dictionaryTypes';
import { logWarn } from '@humanmanual/core';
import './dictionary.css';

type Status = 'idle' | 'loading' | 'done' | 'error';

// ECDICT exchange codes -> Chinese label for the forms row.
const EXCHANGE_LABELS: Record<string, string> = {
  p: '过去式',
  d: '过去分词',
  i: '现在分词',
  '3': '第三人称单数',
  r: '比较级',
  t: '最高级',
  s: '复数',
};

function parseExchange(exchange: string): Array<{ label: string; value: string }> {
  if (!exchange) return [];
  return exchange
    .split('/')
    .map((part) => {
      const [code, value] = part.split(':');
      const label = EXCHANGE_LABELS[code];
      return label && value ? { label, value } : null;
    })
    .filter((x): x is { label: string; value: string } => x !== null);
}

function splitLines(text: string): string[] {
  return text
    .split(/\\n|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function DictionaryWindow() {
  const [input, setInput] = useState('');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runLookup = useCallback(async (raw: string) => {
    const word = raw.trim();
    if (!word) {
      setEntry(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const result = await lookupWord(word);
      setEntry(result);
      setStatus('done');
    } catch (err) {
      setErrorMsg(typeof err === 'string' ? err : '查询失败，请稍后重试。');
      setEntry(null);
      setStatus('error');
    }
  }, []);

  // Initial word from the ?word= query param.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('word') ?? '';
    if (initial) {
      setInput(initial);
      void runLookup(initial);
    }
    inputRef.current?.focus();
  }, [runLookup]);

  // Subsequent Ctrl+L presses while the window is open push new words here.
  useEffect(() => {
    const unlistenPromise = listen<DictionaryLookupPayload>(DICTIONARY_LOOKUP_EVENT, (event) => {
      const word = event.payload?.word ?? '';
      if (word) {
        setInput(word);
        void runLookup(word);
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [runLookup]);

  // Track maximize state for the window control icon.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const init = async () => {
      try {
        const win = getCurrentWindow();
        setIsMaximized(await win.isMaximized());
        setIsAlwaysOnTop(await win.isAlwaysOnTop());
        unlisten = await win.onResized(async () => {
          setIsMaximized(await win.isMaximized());
        });
      } catch (e) {
        logWarn('dictionaryWindow', 'window state listener warning', e);
      }
    };
    void init();
    return () => unlisten?.();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runLookup(input);
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.tagName === 'INPUT') return;
    try {
      void getCurrentWindow().startDragging();
    } catch (err) {
      logWarn('dictionaryWindow', 'startDragging error', err);
    }
  };

  const handleToggleAlwaysOnTop = async () => {
    try {
      const win = getCurrentWindow();
      const next = !isAlwaysOnTop;
      await win.setAlwaysOnTop(next);
      setIsAlwaysOnTop(next);
    } catch (err) {
      console.warn('toggle alwaysOnTop error:', err);
    }
  };

  const handleMinimize = () => getCurrentWindow().minimize().catch(() => {});
  const handleToggleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch (err) {
      console.warn('toggle maximize error:', err);
    }
  };
  const handleClose = () => getCurrentWindow().close().catch(() => window.close());

  return (
    <div className="dict-window">
      <div className="dict-header" onMouseDown={handleHeaderMouseDown}>
        <span className="dict-header-title">词典查询</span>
        <div className="dict-window-controls">
          <button
            type="button"
            className={`dict-window-btn pin-btn ${isAlwaysOnTop ? 'active' : ''}`}
            onClick={handleToggleAlwaysOnTop}
            title={isAlwaysOnTop ? '取消置顶' : '窗口置顶'}
            aria-label={isAlwaysOnTop ? '取消置顶' : '窗口置顶'}
          >
            <Pin size={14} style={{ transform: isAlwaysOnTop ? 'rotate(-45deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
          <button type="button" className="dict-window-btn" onClick={handleMinimize} title="最小化" aria-label="最小化">
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="dict-window-btn"
            onClick={handleToggleMaximize}
            title={isMaximized ? '向下还原' : '最大化'}
            aria-label={isMaximized ? '向下还原' : '最大化'}
          >
            {isMaximized ? <Copy size={13} /> : <Square size={13} />}
          </button>
          <button type="button" className="dict-window-btn close-btn" onClick={handleClose} title="关闭" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      </div>

      <form className="dict-search" onSubmit={handleSubmit}>
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
        {status === 'idle' && <div className="dict-hint">按 Ctrl+L 可随时呼出词典。</div>}
        {status === 'done' && entry && <DictResult entry={entry} />}
      </div>
    </div>
  );
}

/** 查词结果展示组件 */
export function DictResult({ entry }: { entry: DictEntry }) {
  if (!entry.found) {
    return (
      <div className="dict-hint">
        未找到 <strong>{entry.word}</strong> 的释义。
      </div>
    );
  }

  const playAudio = (url?: string) => {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch((err) => console.warn('Audio play failed:', err));
  };

  const translations = splitLines(entry.translation);
  const definitions = splitLines(entry.definition);
  const forms = parseExchange(entry.exchange);

  return (
    <div className="dict-result">
      <div className="dict-word-row">
        <h1 className="dict-word">{entry.word}</h1>
      </div>

      {entry.lemmatizedFrom && (
        <div className="dict-lemma-note">
          由 <strong>{entry.lemmatizedFrom}</strong> 还原为原形
        </div>
      )}

      {/* Phonetics & Audio Controls */}
      <div className="dict-phonetic-row">
        {entry.ukPhonetic && (
          <button
            type="button"
            className="dict-audio-btn"
            onClick={() => playAudio(entry.ukAudio)}
            title="点击播放英音"
          >
            <span className="dict-audio-tag">英</span> [{entry.ukPhonetic}]
            <Volume2 size={13} className="dict-audio-icon" />
          </button>
        )}
        {entry.usPhonetic && (
          <button
            type="button"
            className="dict-audio-btn"
            onClick={() => playAudio(entry.usAudio)}
            title="点击播放美音"
          >
            <span className="dict-audio-tag">美</span> [{entry.usPhonetic}]
            <Volume2 size={13} className="dict-audio-icon" />
          </button>
        )}
        {!entry.ukPhonetic && !entry.usPhonetic && entry.phonetic && (
          <button
            type="button"
            className="dict-audio-btn"
            onClick={() => playAudio(entry.usAudio || entry.ukAudio)}
            title="点击播放发音"
          >
            /{entry.phonetic}/
            <Volume2 size={13} className="dict-audio-icon" />
          </button>
        )}
      </div>

      {/* Part of Speech */}
      {entry.pos && (
        <div className="dict-meta-row">
          <span className="dict-pos-badge" title="词性">
            {entry.pos}
          </span>
        </div>
      )}

      {translations.length > 0 && (
        <section className="dict-section">
          <h2 className="dict-section-title">中文释义</h2>
          <ul className="dict-list">
            {translations.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {definitions.length > 0 && (
        <section className="dict-section">
          <h2 className="dict-section-title">英文释义</h2>
          <ul className="dict-list dict-list-en">
            {definitions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Bilingual Example Sentences */}
      {entry.examples && entry.examples.length > 0 && (
        <section className="dict-section">
          <h2 className="dict-section-title">双语例句</h2>
          <div className="dict-examples-list">
            {entry.examples.map((ex, i) => (
              <div key={i} className="dict-example-card">
                <div className="dict-example-sentence">
                  <span>{ex.sentence}</span>
                  <button
                    type="button"
                    className="dict-example-audio"
                    onClick={() => playAudio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(ex.sentence)}`)}
                    title="播放例句发音"
                  >
                    <Volume2 size={12} />
                  </button>
                </div>
                <div className="dict-example-tran">{ex.translation}</div>
                {ex.source && <div className="dict-example-source">—— {ex.source}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Common Phrases */}
      {entry.phrases && entry.phrases.length > 0 && (
        <section className="dict-section">
          <h2 className="dict-section-title">常用短语 / 词组</h2>
          <div className="dict-phrases-grid">
            {entry.phrases.map((p, i) => (
              <div key={i} className="dict-phrase-card">
                <span className="dict-phrase-text">{p.phrase}</span>
                {p.translation && <span className="dict-phrase-tran">{p.translation}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {forms.length > 0 && (
        <section className="dict-section">
          <h2 className="dict-section-title">词形变化</h2>
          <div className="dict-forms">
            {forms.map((f) => (
              <span key={f.label} className="dict-form">
                <span className="dict-form-label">{f.label}</span>
                <span className="dict-form-value">{f.value}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

