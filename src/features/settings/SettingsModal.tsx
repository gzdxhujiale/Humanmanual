import { isMobilePlatform } from "../../lib/platform";
import { SettingsModalDesktop } from "./SettingsModalDesktop";
import { SettingsModalMobile } from "./SettingsModalMobile";

export function SettingsModal(props: { onClose: () => void }) {
  if (isMobilePlatform()) {
    return <SettingsModalMobile {...props} />;
  }
  return <SettingsModalDesktop {...props} />;
}
