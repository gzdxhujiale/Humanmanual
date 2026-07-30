import { isMobilePlatform } from '../../lib/platform';
import { HabitPanelDesktop } from './HabitPanelDesktop';
import { HabitPanelMobile } from './HabitPanelMobile';

export function HabitPanel() {
  if (isMobilePlatform()) {
    return <HabitPanelMobile />;
  }
  return <HabitPanelDesktop />;
}
