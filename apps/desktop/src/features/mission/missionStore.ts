import { create } from "zustand";

interface MissionUIStoreState {
  selectedRoleId: string | null;
  isStatementCollapsed: boolean;

  setSelectedRole: (id: string | null) => void;
  toggleStatementCollapsed: () => void;
}

export const useMissionStore = create<MissionUIStoreState>((set, get) => ({
  selectedRoleId: null,
  isStatementCollapsed: false,

  setSelectedRole: (id) => set({ selectedRoleId: id }),
  toggleStatementCollapsed: () => set({ isStatementCollapsed: !get().isStatementCollapsed }),
}));
