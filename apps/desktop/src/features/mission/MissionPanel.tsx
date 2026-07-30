import { isMobilePlatform } from '../../lib/platform';
import { MissionPanelDesktop } from './MissionPanelDesktop';
import { MissionPanelMobile } from './MissionPanelMobile';

export function MissionPanel() {
  if (isMobilePlatform()) {
    return <MissionPanelMobile />;
  }
  return <MissionPanelDesktop />;
}
