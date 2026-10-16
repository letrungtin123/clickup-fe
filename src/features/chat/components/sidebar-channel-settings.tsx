import { useChannel } from "../hooks/use-channels";
import { useChannelSettingsStore } from "../model/ui-state";
import { ChannelSettingsDialog } from "./channel-settings-dialog";

/**
 * The conversation settings opened from a sidebar row's "…" (owner, 2026-10-16) — the same dialog as the header
 * of an open conversation, for any channel or DM without opening it first. Mounted once in ChatDialogs.
 */
export const SidebarChannelSettings = () => {
  const target = useChannelSettingsStore((state) => state.target);
  const setTab = useChannelSettingsStore((state) => state.setTab);
  const close = useChannelSettingsStore((state) => state.close);
  const detail = useChannel(target?.channelId);
  if (!target || !detail.data || detail.data.id !== target.channelId) return null;
  return (
    <ChannelSettingsDialog
      channel={detail.data}
      open
      tab={target.tab}
      onTabChange={setTab}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    />
  );
};
