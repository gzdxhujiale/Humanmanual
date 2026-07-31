import { call } from "../../lib/tauriClient";
import type { TimeManagementData } from "./useTimeManagementQuery";
import type { Task } from "./timeManagementTypes";

/**
 * timeManagementApi — data-access seam for the Time Management feature.
 * All IPC goes through `call`, which owns logging and rethrow policy.
 */
export const timeManagementApi = {
  loadAll: (): Promise<TimeManagementData | null> =>
    call<TimeManagementData | null>("tm_load_all"),

  upsertTask: (task: Task): Promise<void> => call("tm_upsert_task", { task }),

  deleteTask: (id: string): Promise<void> => call("tm_delete_task", { id }),
};
