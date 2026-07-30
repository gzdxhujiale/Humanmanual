import { useState, useEffect, useRef, useCallback } from 'react';

interface UseReviewAutoSaveOptions {
  /** Initial content for the current review */
  initialContent: string;
  /** Initial rating for the current review */
  initialRating: number;
  /** Current date being viewed */
  date: string;
  /** Debounce interval in ms for high-frequency saves (default: 500) */
  debounceMs?: number;
  /** Callback to persist the review */
  onSave: (date: string, content: string, rating: number, isHighFreq?: boolean) => void;
}

interface UseReviewAutoSaveReturn {
  /** Current content state */
  content: string;
  /** Current rating state */
  rating: number;
  /** Auto save status */
  saveStatus: 'saved' | 'saving';
  /** Update content (triggers debounced save) */
  setContent: (value: string) => void;
  /** Update rating (triggers immediate save) */
  setRating: (value: number) => void;
}

export function useReviewAutoSave({
  initialContent,
  initialRating,
  date,
  debounceMs = 500,
  onSave,
}: UseReviewAutoSaveOptions): UseReviewAutoSaveReturn {
  const [content, setContent] = useState(initialContent);
  const [rating, setRating] = useState(initialRating);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  const stateRef = useRef({ content, rating, date });
  const lastSavedRef = useRef({ content: initialContent, rating: initialRating, date });
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Keep stateRef up to date with current state
  useEffect(() => {
    stateRef.current = { content, rating, date };
  }, [content, rating, date]);

  // Sync initial values when date or props change
  useEffect(() => {
    const prev = stateRef.current;
    const last = lastSavedRef.current;
    if (prev.date !== date) {
      if (prev.content !== last.content || prev.rating !== last.rating) {
        onSaveRef.current(prev.date, prev.content, prev.rating, false);
      }
    }

    setContent(initialContent);
    setRating(initialRating);
    setSaveStatus('saved');
    lastSavedRef.current = { content: initialContent, rating: initialRating, date };
    stateRef.current = { content: initialContent, rating: initialRating, date };
  }, [date, initialContent, initialRating]);

  // Flush unsaved changes on component unmount
  useEffect(() => {
    return () => {
      const current = stateRef.current;
      const last = lastSavedRef.current;
      if (current.content !== last.content || current.rating !== last.rating) {
        onSaveRef.current(current.date, current.content, current.rating, false);
      }
    };
  }, []);

  // Debounced auto-save for content changes
  useEffect(() => {
    if (content === lastSavedRef.current.content && rating === lastSavedRef.current.rating) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      onSaveRef.current(date, content, rating, true);
      lastSavedRef.current = { content, rating, date };
      setSaveStatus('saved');
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [content, rating, date, debounceMs]);

  // Immediate save when rating changes
  const handleRatingChange = useCallback((newRating: number) => {
    setRating(newRating);
    setSaveStatus('saving');
    const currentContent = stateRef.current.content;
    onSaveRef.current(date, currentContent, newRating, false);
    lastSavedRef.current = { content: currentContent, rating: newRating, date };
    setSaveStatus('saved');
  }, [date]);

  return {
    content,
    rating,
    saveStatus,
    setContent,
    setRating: handleRatingChange,
  };
}
