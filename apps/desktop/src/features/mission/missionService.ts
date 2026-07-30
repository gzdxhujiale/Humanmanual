import { call } from "../../lib/tauriClient";
import type { MissionAllData, MissionStatement, Role, Goal } from "./missionTypes";

/**
 * missionService — data-access seam for the Mission feature.
 * All IPC goes through `call`, which owns logging and rethrow policy.
 */
export const missionService = {
  loadAll: (): Promise<MissionAllData> => call<MissionAllData>("mission_load_all"),

  saveStatement: (content: string): Promise<MissionStatement> =>
    call<MissionStatement>("mission_save_statement", { content }),

  createRole: (name: string, icon: string, sortOrder: number): Promise<Role> =>
    call<Role>("mission_create_role", { name, icon, sortOrder }),

  updateRole: (id: string, name: string, icon: string): Promise<void> =>
    call("mission_update_role", { id, name, icon }),

  deleteRole: (id: string): Promise<void> => call("mission_delete_role", { id }),

  reorderRoles: (items: [string, number][]): Promise<void> =>
    call("mission_reorder_roles", { items }),

  createGoal: (roleId: string, title: string, sortOrder: number): Promise<Goal> =>
    call<Goal>("mission_create_goal", { roleId, title, sortOrder }),

  updateGoal: (
    id: string,
    updates: { title?: string; status?: string; timeScope?: string; startDate?: string | null; endDate?: string | null }
  ): Promise<void> =>
    call("mission_update_goal", {
      id,
      title: updates.title ?? null,
      status: updates.status ?? null,
      timeScope: updates.timeScope ?? null,
      startDate: updates.startDate !== undefined ? updates.startDate : null,
      endDate: updates.endDate !== undefined ? updates.endDate : null,
    }),

  deleteGoal: (id: string): Promise<void> => call("mission_delete_goal", { id }),

  reorderGoals: (roleId: string, items: [string, number][]): Promise<void> =>
    call("mission_reorder_goals", { roleId, items }),
};
