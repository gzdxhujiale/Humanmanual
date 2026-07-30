import React from "react";

export interface ToolConfig {
  id: string;
  name: string;
  icon: React.ElementType;
  component: React.FC;
}
