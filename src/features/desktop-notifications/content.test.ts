import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_PREVIEW,
  HIDDEN_PREVIEW,
  PREVIEW_MAX,
  chatContent,
  conversationPath,
  inboxContent,
  messagePreview,
  truncatePreview
} from "./content";

const CHANNEL = "00000000-0000-4000-8000-0000000000c1";
const MESSAGE = "00000000-0000-4000-8000-0000000000a1";
const ROOT = "00000000-0000-4000-8000-0000000000a0";

const user = (displayName: string, id = "00000000-0000-4000-8000-000000000002") => ({
  id,
  displayName,
  email: null,
  avatarUrl: null
});

const message = (overrides: Partial<Parameters<typeof chatContent>[0]["message"]> = {}) => ({
  id: MESSAGE,
  author: user("An"),
  threadRootId: null,
  text: "Chào cả nhà",
  body: null,
  attachments: [],
  ...overrides
});

const attachment = {} as Parameters<typeof messagePreview>[0]["attachments"][number];

describe("preview text", () => {
  it("collapses whitespace and truncates with an ellipsis", () => {
    expect(truncatePreview("  a \n\n b\tc ")).toBe("a b c");
    const long = "x".repeat(PREVIEW_MAX + 20);
    const cut = truncatePreview(long);
    expect(Array.from(cut)).toHaveLength(PREVIEW_MAX);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("never splits an emoji", () => {
    const text = `${"a".repeat(8)}😀😀😀`;
    expect(truncatePreview(text, 10)).toBe(`${"a".repeat(8)}😀…`);
  });

  it("uses the server text, then the rich-text body, then the attachments", () => {
    expect(messagePreview(message())).toBe("Chào cả nhà");
    expect(
      messagePreview(
        message({
          text: "",
          body: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "mention", attrs: { id: "u", label: "Bình" } },
                  { type: "text", text: " xem giúp" }
                ]
              }
            ]
          }
        })
      )
    ).toBe("@Bình xem giúp");
    expect(messagePreview(message({ text: "", attachments: [attachment] }))).toBe(ATTACHMENT_PREVIEW);
    expect(messagePreview(message({ text: "", attachments: [attachment, attachment, attachment] }))).toBe(
      "📎 Đã gửi 3 tệp"
    );
  });
});

describe("chat notification content", () => {
  it("DM: the sender as title, the preview as body, the message deep link", () => {
    const content = chatContent({
      channelId: CHANNEL,
      message: message(),
      channel: { kind: "dm", name: null, participants: [user("An")] },
      showPreview: true
    });
    expect(content).toEqual({
      title: "An",
      body: "Chào cả nhà",
      tag: `chat:${MESSAGE}`,
      path: `/c/${CHANNEL}?message=${MESSAGE}`
    });
  });

  it("channel and group DM titles name the conversation", () => {
    expect(
      chatContent({
        channelId: CHANNEL,
        message: message(),
        channel: { kind: "public", name: "thiet-ke", participants: [] },
        showPreview: true
      }).title
    ).toBe("An · #thiet-ke");
    expect(
      chatContent({
        channelId: CHANNEL,
        message: message(),
        channel: { kind: "group_dm", name: null, participants: [user("An"), user("Bình"), user("Chi")] },
        showPreview: true
      }).title
    ).toBe("An · An, Bình, Chi");
  });

  it("hides the text when previews are off", () => {
    const content = chatContent({ channelId: CHANNEL, message: message(), channel: null, showPreview: false });
    expect(content.body).toBe(HIDDEN_PREVIEW);
    expect(content.title).toBe("An");
  });

  it("thread replies open the thread at the reply", () => {
    const content = chatContent({
      channelId: CHANNEL,
      message: message({ threadRootId: ROOT }),
      channel: { kind: "public", name: "chung", participants: [] },
      showPreview: true
    });
    expect(content.body).toBe("Trả lời trong chủ đề: Chào cả nhà");
    expect(content.path).toBe(conversationPath(CHANNEL, { id: MESSAGE, threadRootId: ROOT }));
    expect(content.path).toBe(`/c/${CHANNEL}?thread=${ROOT}&message=${MESSAGE}`);
  });
});

describe("inbox notification content", () => {
  it("subject as title, sentence and excerpt as body", () => {
    expect(inboxContent({ id: "n1", title: "Job A-12", body: "Sửa lại nền" }, "Minh đã giao cho bạn A-12")).toEqual({
      title: "Job A-12",
      body: "Minh đã giao cho bạn A-12 — Sửa lại nền",
      tag: "notif:n1",
      path: null
    });
  });

  it("falls back to the sentence when there is no subject", () => {
    const content = inboxContent({ id: "n2", title: " ", body: null }, "Có cảnh báo hệ thống");
    expect(content.title).toBe("Có cảnh báo hệ thống");
    expect(content.body).toBe("");
  });
});
