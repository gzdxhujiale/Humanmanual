import { useEffect } from 'react';
import { CheckCircle2, Flame, Award } from 'lucide-react';
import { useHabitStore } from './habitStore';
import { formatDateYMD as formatDateStr } from '../../lib/dateUtils';
import { triggerHaptic } from '../../lib/haptics';

export function HabitPanelMobile() {
  const loadAll = useHabitStore((s) => s.loadAll);
  const toggleCheckIn = useHabitStore((s) => s.toggleCheckIn);
  const getCheckInStatus = useHabitStore((s) => s.getCheckInStatus);
  const getStats = useHabitStore((s) => s.getStats);
  const getHabitsForDate = useHabitStore((s) => s.getHabitsForDate);

  const todayStr = formatDateStr(new Date());

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activeHabits = getHabitsForDate(todayStr);

  const handleToggle = (habitId: string) => {
    const isChecked = getCheckInStatus(habitId, todayStr);
    if (!isChecked) {
      triggerHaptic('success');
    } else {
      triggerHaptic('light');
    }
    toggleCheckIn(habitId, todayStr);
  };

  return (
    <div className="habit-panel mobile" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', overflowY: 'auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>习惯打卡</h2>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>今日累计 {activeHabits.filter((h) => getCheckInStatus(h.id, todayStr)).length} / {activeHabits.length}</span>
      </header>

      {activeHabits.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          暂无打卡习惯，去创建你的第一个习惯吧！
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {activeHabits.map((habit) => {
            const isChecked = getCheckInStatus(habit.id, todayStr);
            const stats = getStats(habit.id, todayStr);

            return (
              <div
                key={habit.id}
                onClick={() => handleToggle(habit.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  borderRadius: '12px',
                  background: isChecked ? 'rgba(16,185,129,0.08)' : 'var(--surface-1)',
                  border: isChecked ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(123,145,169,0.15)',
                  cursor: 'pointer',
                  minHeight: '64px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: isChecked ? 'var(--green, #10b981)' : 'var(--text-strong)' }}>
                    {habit.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Flame size={14} color="#f97316" /> 连续 {stats.currentStreak} 天
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Award size={14} color="#eab308" /> 本月 {stats.monthCheckIns} 次
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: isChecked ? 'var(--green, #10b981)' : 'transparent',
                    border: isChecked ? 'none' : '2px solid var(--text-muted)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  {isChecked && <CheckCircle2 size={22} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
