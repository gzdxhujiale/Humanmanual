import { useCallback, useEffect } from 'react';
import { TaskQuickEditPopover, type TaskQuickEditHandle } from './TaskQuickEdit';
import {
  useQuickEditOverlayStore,
  registerQuickEditOverlayHandle,
} from './quickEditOverlayStore';

// ==========================================
// QuickEditOverlayHost — 移动端快捷编辑浮层宿主
// 挂在 App 根部（仅移动端渲染）。浮层组件自身 portal 到 body
// 并以 fixed 定位（z-index 1050+），这里只负责生命周期与句柄注册。
// ==========================================

export function QuickEditOverlayHost() {
  const request = useQuickEditOverlayStore((s) => s.request);
  const close = useQuickEditOverlayStore((s) => s.close);

  const handleRef = useCallback((h: TaskQuickEditHandle | null) => {
    registerQuickEditOverlayHandle(h);
  }, []);

  useEffect(() => () => registerQuickEditOverlayHandle(null), []);

  if (!request) return null;

  return (
    <TaskQuickEditPopover
      key={request.session}
      ref={handleRef}
      task={request.task}
      quadrant={request.quadrant}
      anchorRect={request.anchorRect}
      onSave={request.onSave}
      onCreate={(draft) => {
        if (request.quadrant) request.onCreate?.(request.quadrant, draft);
      }}
      onClose={close}
    />
  );
}
