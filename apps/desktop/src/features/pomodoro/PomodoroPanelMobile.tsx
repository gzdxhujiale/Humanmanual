import { Play, Pause, RotateCcw, CheckCircle2 } from 'lucide-react';
import { usePomodoroStore } from './pomodoroStore';
import { triggerHaptic } from '../../lib/haptics';
import './pomodoro.css';

export function PomodoroPanelMobile() {
  const mode = usePomodoroStore((s) => s.mode);
  const phase = usePomodoroStore((s) => s.phase);
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const timeLeft = usePomodoroStore((s) => s.timeLeft);
  const totalTargetSeconds = usePomodoroStore((s) => s.totalTargetSeconds);
  const stopwatchSeconds = usePomodoroStore((s) => s.stopwatchSeconds);

  const startTimer = usePomodoroStore((s) => s.startTimer);
  const pauseTimer = usePomodoroStore((s) => s.pauseTimer);
  const resetTimer = usePomodoroStore((s) => s.resetTimer);
  const finishCurrentSession = usePomodoroStore((s) => s.finishCurrentSession);
  const setMode = usePomodoroStore((s) => s.setMode);

  const displaySeconds = mode === 'stopwatch' ? stopwatchSeconds : timeLeft;
  const minutes = Math.floor(displaySeconds / 60);
  const seconds = displaySeconds % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progress = mode === 'stopwatch' 
    ? (stopwatchSeconds % 60) / 60 
    : (totalTargetSeconds - timeLeft) / totalTargetSeconds;

  const size = 260;
  const strokeWidth = 8;
  const center = size / 2;
  const radius = center - strokeWidth * 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  const strokeColor = phase === 'break' ? 'var(--green, #10b981)' : 'var(--accent, #2563eb)';

  return (
    <div className="pomodoro-panel mobile" style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div className="mobile-pomo-tabs" style={{ display: 'flex', gap: '8px', background: 'var(--surface-1)', padding: '4px', borderRadius: '12px', marginBottom: '24px' }}>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setMode('pomodoro');
          }}
          style={{
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            background: mode === 'pomodoro' ? 'var(--surface-0)' : 'transparent',
            color: mode === 'pomodoro' ? 'var(--text-strong)' : 'var(--text-muted)',
            fontWeight: mode === 'pomodoro' ? 600 : 400,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          番茄钟
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setMode('stopwatch');
          }}
          style={{
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            background: mode === 'stopwatch' ? 'var(--surface-0)' : 'transparent',
            color: mode === 'stopwatch' ? 'var(--text-strong)' : 'var(--text-muted)',
            fontWeight: mode === 'stopwatch' ? 600 : 400,
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          正计时
        </button>
      </div>

      <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--surface-2, rgba(123,145,169,0.15))"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.3s ease' }}
          />
        </svg>

        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '42px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-strong)' }}>
            {timeString}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {phase === 'break' ? '休息时间 ☕' : isRunning ? '专注中 🔥' : '准备就绪'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            resetTimer();
          }}
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            border: '1px solid rgba(123,145,169,0.2)',
            background: 'var(--surface-1)',
            color: 'var(--text-muted)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
          aria-label="重置"
        >
          <RotateCcw size={20} />
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            if (isRunning) pauseTimer();
            else startTimer();
          }}
          style={{
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 8px 20px rgba(37,99,235,0.3)',
            cursor: 'pointer',
          }}
          aria-label={isRunning ? '暂停' : '开始'}
        >
          {isRunning ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '3px' }} />}
        </button>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('success');
            finishCurrentSession();
          }}
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            border: '1px solid rgba(123,145,169,0.2)',
            background: 'var(--surface-1)',
            color: 'var(--green, #10b981)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
          }}
          aria-label="完成"
        >
          <CheckCircle2 size={22} />
        </button>
      </div>
    </div>
  );
}
