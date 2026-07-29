import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Star, Cloud } from 'lucide-react';
import { useDailyReviewStore } from './dailyReviewStore';
import { ReactjsTiptapEditor } from '../reactjs-tiptap-v1';
import { useReviewAutoSave } from './useReviewAutoSave';
import { formatDateYMD as formatDateStr, todayYMD } from '../../lib/dateUtils';
import { triggerHaptic } from '../../lib/haptics';
import './dailyReview.css';

export function DailyReviewPanelMobile() {
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD());

  const reviewsData = useDailyReviewStore((state) => state.data.reviews);
  const syncAllFromDB = useDailyReviewStore((state) => state.syncAllFromDB);
  const saveReview = useDailyReviewStore((state) => state.saveReview);

  useEffect(() => {
    syncAllFromDB();
  }, [syncAllFromDB]);

  const currentReview = reviewsData.find((r) => r.date === selectedDate);

  const handlePrevDay = () => {
    triggerHaptic('light');
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 1);
    setSelectedDate(formatDateStr(date));
  };

  const handleNextDay = () => {
    triggerHaptic('light');
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 1);
    setSelectedDate(formatDateStr(date));
  };

  const { content, rating, saveStatus, setContent, setRating } = useReviewAutoSave({
    initialContent: currentReview?.content || '',
    initialRating: currentReview?.rating || 0,
    date: selectedDate,
    onSave: (date, contentStr, ratingVal, isHighFreq) =>
      saveReview(date, contentStr, ratingVal, isHighFreq),
  });

  return (
    <div className="daily-review-panel mobile" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', background: 'var(--surface-1)', padding: '8px 14px', borderRadius: '12px' }}>
        <button type="button" onClick={handlePrevDay} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-strong)' }}>
          <ChevronLeft size={20} />
        </button>

        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)' }}>
          {selectedDate} {selectedDate === todayYMD() ? '(今天)' : ''}
        </span>

        <button type="button" onClick={handleNextDay} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-strong)' }}>
          <ChevronRight size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', background: 'var(--surface-1)', padding: '12px 14px', borderRadius: '12px' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)' }}>今日复盘状态</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              size={22}
              style={{ cursor: 'pointer', color: star <= rating ? '#eab308' : 'var(--text-muted)' }}
              fill={star <= rating ? 'currentColor' : 'none'}
              onClick={() => {
                triggerHaptic('light');
                setRating(star === rating ? 0 : star);
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
        <ReactjsTiptapEditor
          key={selectedDate}
          content={content}
          initialContent={content}
          onChange={setContent}
          enableCustomTemplates={true}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <Cloud size={16} color={saveStatus === 'saved' ? '#3b82f6' : '#9ca3af'} />
        <span>{saveStatus === 'saving' ? '保存中...' : '已自动保存'}</span>
      </div>
    </div>
  );
}
