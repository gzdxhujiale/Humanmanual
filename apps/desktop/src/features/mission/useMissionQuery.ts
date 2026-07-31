import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@humanmanual/core";
import { missionService } from "./missionService";
import type { Goal } from "./missionTypes";

export function useMissionData() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.mission.all,
    queryFn: async () => {
      const data = await missionService.loadAll();
      // Roles are shared with Time Management (tm_load_all reads the same table);
      // refresh that cache so role edits made here surface there too.
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      return {
        statement: data.statement,
        roles: data.roles || [],
        goals: data.goals || [],
      };
    },
  });
}

export function useSaveStatementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => missionService.saveStatement(content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
    },
  });
}

export function useCreateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, icon, sortOrder }: { name: string; icon: string; sortOrder: number }) =>
      missionService.createRole(name, icon, sortOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useUpdateRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, icon }: { id: string; name: string; icon: string }) =>
      missionService.updateRole(id, name, icon),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useDeleteRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => missionService.deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useReorderRolesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: [string, number][]) => missionService.reorderRoles(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

export function useCreateGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, title, sortOrder }: { roleId: string; title: string; sortOrder: number }) =>
      missionService.createGoal(roleId, title, sortOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
    },
  });
}

export function useUpdateGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Goal, "title" | "status" | "timeScope" | "startDate" | "endDate">>;
    }) => missionService.updateGoal(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
    },
  });
}

export function useDeleteGoalMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => missionService.deleteGoal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
    },
  });
}

export function useReorderGoalsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, items }: { roleId: string; items: [string, number][] }) =>
      missionService.reorderGoals(roleId, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mission.all });
    },
  });
}
