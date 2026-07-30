import { useEffect } from 'react';
import { useMissionStore } from './missionStore';
import { triggerHaptic } from '../../lib/haptics';
import './MissionPanel.css';

export function MissionPanelMobile() {
  const init = useMissionStore((s) => s.init);
  const roles = useMissionStore((s) => s.roles);
  const goals = useMissionStore((s) => s.goals);
  const selectedRoleId = useMissionStore((s) => s.selectedRoleId);
  const setSelectedRole = useMissionStore((s) => s.setSelectedRole);

  useEffect(() => {
    init();
  }, [init]);

  const filteredGoals = selectedRoleId
    ? goals.filter((g) => g.roleId === selectedRoleId)
    : goals;

  return (
    <div className="mission-panel mobile" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', overflowY: 'auto' }}>
      <header style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>人生罗盘与角色</h2>
      </header>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setSelectedRole(null);
          }}
          style={{
            padding: '8px 14px',
            borderRadius: '20px',
            border: 'none',
            background: selectedRoleId === null ? 'var(--accent)' : 'var(--surface-1)',
            color: selectedRoleId === null ? '#fff' : 'var(--text-muted)',
            fontSize: '13px',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          全部角色 ({goals.length})
        </button>

        {roles.map((r) => {
          const count = goals.filter((g) => g.roleId === r.id).length;
          const isSelected = selectedRoleId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedRole(r.id);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: '20px',
                border: 'none',
                background: isSelected ? 'var(--accent)' : 'var(--surface-1)',
                color: isSelected ? '#fff' : 'var(--text-muted)',
                fontSize: '13px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {r.name} ({count})
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredGoals.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            当前角色下暂无目标设定
          </div>
        ) : (
          filteredGoals.map((g) => (
            <div
              key={g.id}
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'var(--surface-1)',
                border: '1px solid rgba(123,145,169,0.12)',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '4px' }}>
                {g.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {g.timeScope} · {g.status}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
