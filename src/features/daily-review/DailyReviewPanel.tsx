import { isMobilePlatform } from '../../lib/platform';
import { DailyReviewPanelDesktop } from './DailyReviewPanelDesktop';
import { DailyReviewPanelMobile } from './DailyReviewPanelMobile';

export function DailyReviewPanel() {
  if (isMobilePlatform()) {
    return <DailyReviewPanelMobile />;
  }
  return <DailyReviewPanelDesktop />;
}
