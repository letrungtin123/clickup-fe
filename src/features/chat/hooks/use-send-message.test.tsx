// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionValueContext } from "@/features/auth/session-context";
import { ApiError } from "@/lib/api/errors";
import type { SessionContext } from "@/lib/api/schemas";

import { chatApi } from "../api";
import { chatKeys } from "../keys";
import { conversationKey, usePendingStore } from "../model/pending";
import { CHANNEL_ID, makeMessage, me } from "../model/test-fixtures";
import type { MessageWindow } from "../model/window";
import { useSendMessage } from "./use-message-actions";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }) }));

const session = {
  user: { id: me.id, displayName: me.displayName, email: me.email },
  organization: { id: "org", name: "Org" },
  role: { permissions: [] },
  hasFullOrganizationAuthority: false,
  mustChangePassword: false
} as unknown as SessionContext;

const setup = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData<MessageWindow>(chatKeys.messages(CHANNEL_ID), {
    items: [makeMessage({ seq: 1 })],
    hasOlder: false,
    hasNewer: false,
    lastReadSeq: 1
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionValueContext value={session}>{children}</SessionValueContext>
    </QueryClientProvider>
  );
  const hook = renderHook(() => useSendMessage(CHANNEL_ID), { wrapper });
  return { queryClient, hook };
};

const pendingList = () => usePendingStore.getState().byConversation[conversationKey(CHANNEL_ID, null)] ?? [];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  toastError.mockReset();
  usePendingStore.setState({ byConversation: {} });
});

describe("useSendMessage", () => {
  it("shows the message immediately and swaps in the server copy", async () => {
    let resolve: (value: Awaited<ReturnType<typeof chatApi.send>>) => void = () => undefined;
    const send = vi.spyOn(chatApi, "send").mockImplementation(
      () => new Promise((done) => {
        resolve = done;
      })
    );
    const { queryClient, hook } = setup();
    const body = { type: "doc" as const, content: [] };
    let clientId = "";
    act(() => {
      clientId = hook.result.current.send({ body, text: "Xin chào", attachments: [], threadRootId: null });
    });
    expect(pendingList()).toHaveLength(1);
    expect(pendingList()[0]).toMatchObject({ status: "sending", clientMessageId: clientId });
    expect(send).toHaveBeenCalledWith(CHANNEL_ID, expect.objectContaining({ clientMessageId: clientId }));

    await act(async () => {
      resolve(makeMessage({ seq: 2, author: me, clientMessageId: clientId }));
      await Promise.resolve();
    });
    await waitFor(() => expect(pendingList()).toHaveLength(0));
    const window = queryClient.getQueryData<MessageWindow>(chatKeys.messages(CHANNEL_ID));
    expect(window?.items.map((message) => message.seq)).toEqual([1, 2]);
  });

  it("keeps rate-limited messages as failed with a retry that reuses the client id", async () => {
    const send = vi
      .spyOn(chatApi, "send")
      .mockRejectedValueOnce(
        new ApiError({ status: 429, code: "CHAT_RATE_LIMITED", message: "slow down" })
      )
      .mockResolvedValueOnce(makeMessage({ seq: 2, author: me }));
    const { hook } = setup();
    let clientId = "";
    act(() => {
      clientId = hook.result.current.send({
        body: { type: "doc", content: [] },
        text: "Xin chào",
        attachments: [],
        threadRootId: null
      });
    });
    await waitFor(() => expect(pendingList()[0]?.status).toBe("failed"));
    expect(pendingList()[0]?.error).toBe("Bạn gửi hơi nhanh. Đợi vài giây rồi thử lại nhé.");
    expect(toastError).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.retry(clientId));
    expect(send).toHaveBeenLastCalledWith(CHANNEL_ID, expect.objectContaining({ clientMessageId: clientId }));
    await waitFor(() => expect(pendingList()).toHaveLength(0));
  });

  it("discards a failed message and its uploaded files", async () => {
    vi.spyOn(chatApi, "send").mockRejectedValueOnce(
      new ApiError({ status: 500, code: "INTERNAL_SERVER_ERROR", message: "boom" })
    );
    const deleteUpload = vi.spyOn(chatApi, "deleteUpload").mockResolvedValue({ ok: true });
    const { hook } = setup();
    let clientId = "";
    act(() => {
      clientId = hook.result.current.send({
        body: { type: "doc", content: [] },
        text: "",
        attachments: [
          { id: "44444444-4444-4444-8444-444444444444", fileName: "a.png", mimeType: "image/png", sizeBytes: 10, isImage: true }
        ],
        threadRootId: null
      });
    });
    await waitFor(() => expect(pendingList()[0]?.status).toBe("failed"));
    act(() => hook.result.current.discard(clientId));
    expect(pendingList()).toHaveLength(0);
    expect(deleteUpload).toHaveBeenCalledWith("44444444-4444-4444-8444-444444444444");
  });
});
