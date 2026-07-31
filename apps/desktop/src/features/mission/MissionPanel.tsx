import React, { useEffect, useState, useMemo, useRef, memo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useConfirmDialog } from "../../components/ui/ConfirmDeleteDialog";
import { useMissionStore } from "./missionStore";
import {
  useMissionData,
  useSaveStatementMutation,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useReorderRolesMutation,
  useCreateGoalMutation,
  useUpdateGoalMutation,
  useDeleteGoalMutation,
} from "./useMissionQuery";
import type { Goal, GoalStatus, Role, TimeScope } from "./missionTypes";
import { GOAL_STATUS_LABELS, TIME_SCOPE_LABELS } from "./missionTypes";
import "./MissionPanel.css";

// ==========================================
// 1. MissionStatementEditor Component
// ==========================================
export const MissionStatementEditor: React.FC = () => {
  const { data } = useMissionData();
  const statement = data?.statement ?? null;
  const isCollapsed = useMissionStore((s) => s.isStatementCollapsed);
  const toggle = useMissionStore((s) => s.toggleStatementCollapsed);
  const saveStatementMutation = useSaveStatementMutation();

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: statement?.content || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveStatementMutation.mutate(html);
      }, 500);
    },
  });

  // Sync editor content if statement changes from outside query fetch
  useEffect(() => {
    if (editor && statement?.content && editor.getHTML() !== statement.content) {
      editor.commands.setContent(statement.content);
    }
  }, [statement?.content, editor]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="mission-statement-section">
      <div className="mission-statement-header" onClick={toggle}>
        <span className="mission-statement-title">📜 个人使命宣言</span>
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </div>
      {!isCollapsed && (
        <div className="mission-statement-editor">
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
};

// ==========================================
// 2. RoleSidebar Components
// ==========================================
interface SortableRoleItemProps {
  role: Role;
  goalCount: number;
  allRoles: Role[];
}

const SortableRoleItem: React.FC<SortableRoleItemProps> = memo(({ role, goalCount, allRoles }) => {
  const selectedRoleId = useMissionStore((s) => s.selectedRoleId);
  const setSelectedRole = useMissionStore((s) => s.setSelectedRole);
  const updateRoleMutation = useUpdateRoleMutation();
  const deleteRoleMutation = useDeleteRoleMutation();
  const { confirm: confirmDelete } = useConfirmDialog();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: role.id });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(role.name);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = () => {
    if (!isEditing) {
      setSelectedRole(role.id);
    }
  };

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(role.name);
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    if (editName.trim() && editName !== role.name) {
      updateRoleMutation.mutate({ id: role.id, name: editName.trim(), icon: role.icon });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(role.name);
    setIsEditing(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await confirmDelete({
      title: "删除角色",
      description: `确定删除角色「${role.name}」？相关目标也会被删除。`,
      confirmText: "删除",
    });
    if (confirmed) {
      if (selectedRoleId === role.id) {
        const remainingRoles = allRoles.filter((r) => r.id !== role.id);
        setSelectedRole(remainingRoles.length > 0 ? remainingRoles[0].id : null);
      }
      deleteRoleMutation.mutate(role.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`role-item ${selectedRoleId === role.id ? "active" : ""}`}
      onClick={handleClick}
    >
      <span className="role-drag-handle" {...attributes} {...listeners}>
        <GripVertical size={14} />
      </span>
      <span className="role-icon">{role.icon}</span>
      {isEditing ? (
        <input
          className="role-edit-input"
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirmEdit();
            if (e.key === "Escape") handleCancelEdit();
          }}
          onClick={(e) => e.stopPropagation()}
          onBlur={handleConfirmEdit}
        />
      ) : (
        <span className="role-name">{role.name}</span>
      )}
      <span className="role-count">{goalCount}</span>
      <div className="role-actions">
        <button className="role-action-btn" onClick={handleStartEdit} title="重命名">
          <Pencil size={12} />
        </button>
        <button className="role-action-btn role-action-delete" onClick={handleDelete} title="删除">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
});

export const RoleSidebar: React.FC = () => {
  const { data } = useMissionData();
  const roles = data?.roles ?? [];
  const goals = data?.goals ?? [];
  const setSelectedRole = useMissionStore((s) => s.setSelectedRole);
  const selectedRoleId = useMissionStore((s) => s.selectedRoleId);

  const createRoleMutation = useCreateRoleMutation();
  const reorderRolesMutation = useReorderRolesMutation();

  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Default selection if none selected
  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      setSelectedRole(roles[0].id);
    }
  }, [selectedRoleId, roles, setSelectedRole]);

  const goalCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    goals.forEach((g) => {
      map[g.roleId] = (map[g.roleId] || 0) + 1;
    });
    return map;
  }, [goals]);

  const handleAdd = () => {
    if (newName.trim()) {
      createRoleMutation.mutate(
        { name: newName.trim(), icon: "🎯", sortOrder: roles.length },
        {
          onSuccess: (newRole) => {
            if (newRole?.id) {
              setSelectedRole(newRole.id);
            }
          },
        }
      );
      setNewName("");
      setIsAdding(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = roles.findIndex((r) => r.id === active.id);
    const newIndex = roles.findIndex((r) => r.id === over.id);
    const reordered = arrayMove(roles, oldIndex, newIndex);
    const items: [string, number][] = reordered.map((r, i) => [r.id, i]);
    reorderRolesMutation.mutate(items);
  };

  const roleIds = useMemo(() => roles.map((r) => r.id), [roles]);

  return (
    <div className="role-sidebar">
      <div className="role-sidebar-header">
        <span className="role-sidebar-title">角色</span>
        <button className="role-add-btn" onClick={() => setIsAdding(true)}>
          +
        </button>
      </div>
      {isAdding && (
        <div className="role-add-input">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            onBlur={() => {
              if (!newName.trim()) setIsAdding(false);
            }}
            placeholder="角色名称"
          />
        </div>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={roleIds} strategy={verticalListSortingStrategy}>
          {roles.map((role) => (
            <SortableRoleItem
              key={role.id}
              role={role}
              goalCount={goalCountMap[role.id] || 0}
              allRoles={roles}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
};

// ==========================================
// 3. GoalCard & GoalDetailPanel Components
// ==========================================
const STATUS_COLORS: Record<GoalStatus, string> = {
  not_started: "#d93025",
  in_progress: "#1e8e3e",
  completed: "#5f6368",
  abandoned: "#9aa0a6",
};

interface GoalCardProps {
  goal: Goal;
}

export const GoalCard: React.FC<GoalCardProps> = memo(({ goal }) => {
  const updateGoalMutation = useUpdateGoalMutation();
  const deleteGoalMutation = useDeleteGoalMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(goal.title);

  const handleStatusCycle = () => {
    const cycle: GoalStatus[] = ["not_started", "in_progress", "completed"];
    const idx = cycle.indexOf(goal.status);
    const next = cycle[(idx + 1) % cycle.length];
    updateGoalMutation.mutate({ id: goal.id, updates: { status: next } });
  };

  const handleTimeScopeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateGoalMutation.mutate({ id: goal.id, updates: { timeScope: e.target.value as TimeScope } });
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== goal.title) {
      updateGoalMutation.mutate({ id: goal.id, updates: { title: editTitle.trim() } });
    } else {
      setEditTitle(goal.title);
    }
    setIsEditing(false);
  };

  return (
    <div className="goal-card">
      <div className="goal-card-main">
        {isEditing ? (
          <input
            className="goal-edit-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveTitle();
              if (e.key === "Escape") {
                setEditTitle(goal.title);
                setIsEditing(false);
              }
            }}
            onBlur={handleSaveTitle}
            autoFocus
          />
        ) : (
          <span
            className="goal-title"
            onDoubleClick={() => setIsEditing(true)}
            title="双击或点击编辑按钮进行修改"
          >
            {goal.title}
          </span>
        )}
        <span
          className="goal-status-badge"
          style={{ background: `${STATUS_COLORS[goal.status]}20`, color: STATUS_COLORS[goal.status] }}
          onClick={handleStatusCycle}
          title="点击切换状态"
        >
          {GOAL_STATUS_LABELS[goal.status]}
        </span>
      </div>
      <div className="goal-card-footer">
        <select
          className="goal-time-scope"
          value={goal.timeScope}
          onChange={handleTimeScopeChange}
        >
          {Object.entries(TIME_SCOPE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
        <div className="goal-card-actions">
          <button
            className="goal-action-icon-btn"
            onClick={() => setIsEditing(!isEditing)}
            title="编辑目标"
          >
            <Pencil size={14} />
          </button>
          <button
            className="goal-action-icon-btn goal-delete-icon-btn"
            onClick={() => deleteGoalMutation.mutate(goal.id)}
            title="删除目标"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
});

export const GoalDetailPanel: React.FC = () => {
  const selectedRoleId = useMissionStore((s) => s.selectedRoleId);
  const { data } = useMissionData();
  const roles = data?.roles ?? [];
  const goals = data?.goals ?? [];
  const createGoalMutation = useCreateGoalMutation();

  const [newTitle, setNewTitle] = useState("");

  const role = useMemo(() => roles.find((r) => r.id === selectedRoleId), [roles, selectedRoleId]);
  const roleGoals = useMemo(
    () => goals.filter((g) => g.roleId === selectedRoleId),
    [goals, selectedRoleId]
  );

  if (!role) {
    return (
      <div className="goal-detail-empty">
        <p>请选择一个角色，或添加新角色</p>
      </div>
    );
  }

  const handleAdd = () => {
    if (newTitle.trim() && selectedRoleId) {
      createGoalMutation.mutate({
        roleId: selectedRoleId,
        title: newTitle.trim(),
        sortOrder: roleGoals.length,
      });
      setNewTitle("");
    }
  };

  return (
    <div className="goal-detail-panel">
      <div className="goal-detail-header">
        <span className="goal-detail-title">
          {role.icon} {role.name}
        </span>
        <div className="goal-add-row">
          <input
            className="goal-add-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="添加新目标..."
          />
          <button className="goal-add-btn" onClick={handleAdd}>
            +
          </button>
        </div>
      </div>
      <div className="goal-list">
        {roleGoals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} />
        ))}
        {roleGoals.length === 0 && (
          <p className="goal-empty-hint">暂无目标，点击上方添加</p>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 4. MissionPanel Main Component
// ==========================================
export const MissionPanel: React.FC = () => {
  return (
    <div className="mission-panel">
      <MissionStatementEditor />
      <div className="mission-bottom">
        <RoleSidebar />
        <GoalDetailPanel />
      </div>
    </div>
  );
};
