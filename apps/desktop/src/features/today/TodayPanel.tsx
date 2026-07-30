import { isMobilePlatform } from "../../lib/platform";
import { TodayPanelDesktop, type TodayPanelProps } from "./TodayPanelDesktop";
import { TodayPanelMobile } from "./TodayPanelMobile";

export type { TodayPanelProps };

export function TodayPanel(props: TodayPanelProps) {
  if (isMobilePlatform()) {
    return <TodayPanelMobile {...props} />;
  }
  return <TodayPanelDesktop {...props} />;
}
