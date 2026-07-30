import { create } from "zustand";
import type { MissionStatement, Role, Goal } from "./missionTypes";
import { missionService } from "./missionService";
import { createSyncEngine, HIGH_FREQ_DELAY, LOW_FREQ_DELAY, logError } from "@humanmanual/core";
import { useTimeStore } from "../time-management/timeManagementStore";
import type { Role as TimeRole } from "../time-management/timeManagementTypes";

interface MissionStoreState {
  statement: MissionStatement | null;
  roles: Role[];
  goals: Goal[];
  selectedRoleId: string | null;
  isStatementCollapsed: boolean;

  // UI actions
  init: () => Promise<void>;
  setSelectedRole: (id: string | null) => void;
  toggleStatementCollapsed: () => void;

  // Statement
  saveStatement: (content: string) => void;

  // Roles
  addRole: (name: string, icon: string) => void;
  updateRole: (id: string, updates: Partial<Pick<Role, "name" | "icon">>) => void;
  deleteRole: (id: string) => void;
  reorderRoles: (newOrder: string[]) => void;

  // Goals
  addGoal: (title: string) => void;
  updateGoal: (id: string, updates: Partial<Pick<Goal, "title" | "status" | "timeScope" | "startDate" | "endDate">>) => void;
  deleteGoal: (id: string) => void;
  reorderGoals: (newOrder: string[]) => void;
}

const syncEngine = createSyncEngine();

/**
 * Mission roles and time-management roles are different shapes; convert
 * explicitly instead of casting. Colors are assigned inside the time store.
 */
function toTimeRoles(roles: Role[]): TimeRole[] {
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: Date.parse(r.createdAt) || Date.now(),
  }));
}

function notifyTimeStoreRoles(roles: Role[]) {
  try {
    useTimeStore.getState().setRoles(toTimeRoles(roles));
  } catch (e) {
    logError("missionStore", "failed to sync roles to time store", e);
  }
}

export const useMissionStore = create<MissionStoreState>((set, get) => ({
  statement: null,
  roles: [],
  goals: [],
  selectedRoleId: null,
  isStatementCollapsed: false,

  init: async () => {
    try {
      const data = await missionService.loadAll();
      set({ statement: data.statement, roles: data.roles, goals: data.goals, selectedRoleId: data.roles[0]?.id ?? null });
      notifyTimeStoreRoles(data.roles);
    } catch (e) {
      logError("missionStore", "init failed", e);
    }
  },

  setSelectedRole: (id) => set({ selectedRoleId: id }),
  toggleStatementCollapsed: () => set({ isStatementCollapsed: !get().isStatementCollapsed }),

  saveStatement: (content) => {
    const stmt: MissionStatement = { id: "default", content, updatedAt: new Date().toISOString() };
    set({ statement: stmt });
    syncEngine.schedule("mission:statement", async () => { await missionService.saveStatement(content); }, HIGH_FREQ_DELAY);
  },

  addRole: (name, icon) => {
    const roles = get().roles;
    const newRole: Role = {
      id: crypto.randomUUID(),
      name,
      icon,
      sortOrder: roles.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const newRoles = [...roles, newRole];
    set({ roles: newRoles, selectedRoleId: newRole.id });
    notifyTimeStoreRoles(newRoles);
    syncEngine.schedule(`role:${newRole.id}`, async () => { await missionService.createRole(name, icon, newRole.sortOrder); }, LOW_FREQ_DELAY);
  },

  updateRole: (id, updates) => {
    const roles = get().roles.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r);
    set({ roles });
    notifyTimeStoreRoles(roles);
    const updated = roles.find(r => r.id === id);
    if (updated) {
      syncEngine.schedule(`role:${id}`, () => missionService.updateRole(id, updated.name, updated.icon), HIGH_FREQ_DELAY);
    }
  },

  deleteRole: (id) => {
    const roles = get().roles.filter(r => r.id !== id);
    const goals = get().goals.filter(g => g.roleId !== id);
    const selectedRoleId = get().selectedRoleId === id ? (roles[0]?.id ?? null) : get().selectedRoleId;
    set({ roles, goals, selectedRoleId });
    notifyTimeStoreRoles(roles);
    syncEngine.cancel(`role:${id}`);
    missionService.deleteRole(id).catch(e => logError("missionStore", "failed to delete role", e));
  },

  reorderRoles: (newOrder) => {
    const roles = [...get().roles].sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    set({ roles });
    notifyTimeStoreRoles(roles);
    const items: [string, number][] = roles.map((r, i) => [r.id, i]);
    syncEngine.schedule("reorder:roles", () => missionService.reorderRoles(items), LOW_FREQ_DELAY);
  },

  addGoal: (title) => {
    const roleId = get().selectedRoleId;
    if (!roleId) return;
    const roleGoals = get().goals.filter(g => g.roleId === roleId);
    const newGoal: Goal = {
      id: crypto.randomUUID(),
      roleId,
      title,
      status: "not_started",
      timeScope: "long",
      startDate: null,
      endDate: null,
      sortOrder: roleGoals.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const goals = [...get().goals, newGoal];
    set({ goals });
    syncEngine.schedule(`goal:${newGoal.id}`, async () => { await missionService.createGoal(roleId, title, newGoal.sortOrder); }, LOW_FREQ_DELAY);
  },

  updateGoal: (id, updates) => {
    const goals = get().goals.map(g => g.id === id ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g);
    set({ goals });
    const updated = goals.find(g => g.id === id);
    if (updated) {
      syncEngine.schedule(`goal:${id}`, () =>
        missionService.updateGoal(id, {
          title: updated.title,
          status: updated.status,
          timeScope: updated.timeScope,
          startDate: updated.startDate,
          endDate: updated.endDate,
        }), HIGH_FREQ_DELAY);
    }
  },

  deleteGoal: (id) => {
    const goals = get().goals.filter(g => g.id !== id);
    set({ goals });
    syncEngine.cancel(`goal:${id}`);
    missionService.deleteGoal(id).catch(e => logError("missionStore", "failed to delete goal", e));
  },

  reorderGoals: (newOrder) => {
    const roleId = get().selectedRoleId;
    if (!roleId) return;
    const roleGoals = get().goals.filter(g => g.roleId === roleId);
    const otherGoals = get().goals.filter(g => g.roleId !== roleId);
    const sorted = [...roleGoals].sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    const goals = [...otherGoals, ...sorted];
    set({ goals });
    const items: [string, number][] = sorted.map((g, i) => [g.id, i]);
    syncEngine.schedule("reorder:goals", () => missionService.reorderGoals(roleId, items), LOW_FREQ_DELAY);
  },
}));
