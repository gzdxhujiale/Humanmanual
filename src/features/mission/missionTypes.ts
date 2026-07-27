export type GoalStatus = "not_started" | "in_progress" | "completed" | "abandoned";
export type TimeScope = "short" | "medium" | "long" | "ongoing";

export interface MissionStatement {
  id: string;
  content: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  roleId: string;
  title: string;
  status: GoalStatus;
  timeScope: TimeScope;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MissionAllData {
  statement: MissionStatement | null;
  roles: Role[];
  goals: Goal[];
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
  abandoned: "已放弃",
};

export const TIME_SCOPE_LABELS: Record<TimeScope, string> = {
  short: "短期目标",
  medium: "中期目标",
  long: "长期目标",
  ongoing: "持续",
};
