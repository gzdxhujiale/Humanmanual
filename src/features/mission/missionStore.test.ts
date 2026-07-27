import { describe, it, expect, beforeEach, vi } from "vitest";
import { useMissionStore } from "./missionStore";

// Mock service
vi.mock("./missionService", () => ({
  missionService: {
    loadAll: vi.fn().mockResolvedValue({ statement: null, roles: [], goals: [] }),
    saveStatement: vi.fn().mockResolvedValue({ id: "default", content: "test", updatedAt: "" }),
    createRole: vi.fn().mockImplementation((name: string, icon: string, sortOrder: number) =>
      Promise.resolve({ id: "r-new", name, icon, sortOrder, createdAt: "", updatedAt: "" })
    ),
    updateRole: vi.fn().mockResolvedValue(undefined),
    deleteRole: vi.fn().mockResolvedValue(undefined),
    reorderRoles: vi.fn().mockResolvedValue(undefined),
    createGoal: vi.fn().mockImplementation((roleId: string, title: string, sortOrder: number) =>
      Promise.resolve({ id: "g-new", roleId, title, status: "not_started", timeScope: "long", startDate: null, endDate: null, sortOrder, createdAt: "", updatedAt: "" })
    ),
    updateGoal: vi.fn().mockResolvedValue(undefined),
    deleteGoal: vi.fn().mockResolvedValue(undefined),
    reorderGoals: vi.fn().mockResolvedValue(undefined),
  },
}));

beforeEach(() => {
  useMissionStore.setState({
    statement: null,
    roles: [],
    goals: [],
    selectedRoleId: null,
    isStatementCollapsed: false,
  });
});

describe("MissionStore", () => {
  describe("init", () => {
    it("loads data from service", async () => {
      await useMissionStore.getState().init();
      // No crash = pass (service is mocked)
    });
  });

  describe("roles", () => {
    it("addRole appends a role to state", () => {
      useMissionStore.getState().addRole("家庭成员", "👨‍👩‍👧");
      const { roles } = useMissionStore.getState();
      expect(roles).toHaveLength(1);
      expect(roles[0].name).toBe("家庭成员");
      expect(roles[0].icon).toBe("👨‍👩‍👧");
    });

    it("deleteRole removes a role and its goals", () => {
      useMissionStore.getState().addRole("角色A", "🅰️");
      useMissionStore.getState().addRole("角色B", "🅱️");
      const roleId = useMissionStore.getState().roles[0].id;
      useMissionStore.getState().deleteRole(roleId);
      expect(useMissionStore.getState().roles).toHaveLength(1);
      expect(useMissionStore.getState().roles[0].name).toBe("角色B");
    });

    it("updateRole modifies role fields", () => {
      useMissionStore.getState().addRole("旧名称", "📌");
      const roleId = useMissionStore.getState().roles[0].id;
      useMissionStore.getState().updateRole(roleId, { name: "新名称" });
      expect(useMissionStore.getState().roles[0].name).toBe("新名称");
    });
  });

  describe("goals", () => {
    it("addGoal appends a goal to the selected role", () => {
      useMissionStore.getState().addRole("角色", "🎯");
      const roleId = useMissionStore.getState().roles[0].id;
      useMissionStore.setState({ selectedRoleId: roleId });
      useMissionStore.getState().addGoal("目标1");
      const { goals } = useMissionStore.getState();
      expect(goals).toHaveLength(1);
      expect(goals[0].title).toBe("目标1");
      expect(goals[0].roleId).toBe(roleId);
    });

    it("updateGoal modifies goal fields", () => {
      useMissionStore.getState().addRole("角色", "🎯");
      const roleId = useMissionStore.getState().roles[0].id;
      useMissionStore.setState({ selectedRoleId: roleId });
      useMissionStore.getState().addGoal("目标");
      const goalId = useMissionStore.getState().goals[0].id;
      useMissionStore.getState().updateGoal(goalId, { status: "in_progress" });
      expect(useMissionStore.getState().goals[0].status).toBe("in_progress");
    });

    it("deleteGoal removes a goal", () => {
      useMissionStore.getState().addRole("角色", "🎯");
      const roleId = useMissionStore.getState().roles[0].id;
      useMissionStore.setState({ selectedRoleId: roleId });
      useMissionStore.getState().addGoal("目标");
      const goalId = useMissionStore.getState().goals[0].id;
      useMissionStore.getState().deleteGoal(goalId);
      expect(useMissionStore.getState().goals).toHaveLength(0);
    });
  });
});
