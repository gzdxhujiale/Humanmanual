import { isMobilePlatform } from '../../lib/platform';
import { ListsPanelDesktop } from './ListsPanelDesktop';
import { ListsPanelMobile } from './ListsPanelMobile';

export function ListsPanel() {
  if (isMobilePlatform()) {
    return <ListsPanelMobile />;
  }
  return <ListsPanelDesktop />;
}
