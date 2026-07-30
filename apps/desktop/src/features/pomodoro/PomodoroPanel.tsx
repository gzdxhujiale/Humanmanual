import { isMobilePlatform } from '../../lib/platform';
import { PomodoroPanelDesktop } from './PomodoroPanelDesktop';
import { PomodoroPanelMobile } from './PomodoroPanelMobile';

export function PomodoroPanel() {
  if (isMobilePlatform()) {
    return <PomodoroPanelMobile />;
  }
  return <PomodoroPanelDesktop />;
}
