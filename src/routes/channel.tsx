import { useParams } from "react-router";

import { NotFoundRoute } from "@/routes/errors";
import { ChannelScreen } from "@/features/chat/components/channel-screen";
import { ConversationsPage } from "@/features/chat/components/conversations-page";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/c/:channelId` — one conversation (channel, DM or group DM). */
export const ChannelRoute = () => {
  const { channelId } = useParams();
  if (!channelId || !uuidPattern.test(channelId)) {
    return <NotFoundRoute />;
  }
  return <ChannelScreen key={channelId} channelId={channelId} />;
};

/** `/c` — all conversations (mobile entry point of the chat stack). */
export const ChannelsIndexRoute = () => <ConversationsPage />;
