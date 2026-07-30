import { isMobilePlatform } from '../../lib/platform';
import { TimeManagementPanelDesktop, type TimeManagementPanelProps } from './TimeManagementPanelDesktop';
import { TimeManagementPanelMobile } from './TimeManagementPanelMobile';

export type { TimeManagementPanelProps };

export function TimeManagementPanel(props: TimeManagementPanelProps) {
  if (isMobilePlatform()) {
    return <TimeManagementPanelMobile {...props} />;
  }
  return <TimeManagementPanelDesktop {...props} />;
}
