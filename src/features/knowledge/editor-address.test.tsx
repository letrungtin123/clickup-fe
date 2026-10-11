// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate, useParams } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { adoptAutoDraft, itemEditPath } from "./editor-address";
import { draftKey, readDraft, writeDraft, type EditorFields } from "./model/drafts";

/**
 * A new item auto-saved as a draft before its first image upload: the address switches to the item's edit
 * URL without remounting the editor, so a reload reopens the draft item, and the local draft moves to it.
 */
const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const userId = id(1);
const spaceId = id(2);
const itemId = id(3);

const fields: EditorFields = {
  title: "Quy trình mới",
  summary: "",
  body: { type: "doc", content: [] },
  categoryId: null,
  importance: "normal",
  statusId: null,
  ownerId: null,
  effectiveFrom: null,
  reviewBy: null,
  tags: []
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("adoptAutoDraft", () => {
  it("replaces the address with the item's edit URL, keeping the history entry and the router state", () => {
    window.history.replaceState({ usr: null, key: "abc", idx: 4 }, "", `/k/${spaceId}/new?cat=${id(9)}`);
    const entries = window.history.length;
    writeDraft(draftKey(userId, { spaceId }), { baseVersion: null, fields, versionNote: "" });

    const key = adoptAutoDraft({ userId, spaceId, itemId });

    expect(window.location.pathname).toBe(`/k/${spaceId}/i/${itemId}/edit`);
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(entries);
    expect(window.history.state).toEqual({ usr: null, key: "abc", idx: 4 });
    // The new-item draft of the space is gone; the autosave continues under the item's key.
    expect(readDraft(draftKey(userId, { spaceId }))).toBeNull();
    expect(key).toBe(draftKey(userId, { itemId }));
  });

  it("builds encoded edit paths", () => {
    expect(itemEditPath(spaceId, itemId)).toBe(`/k/${spaceId}/i/${itemId}/edit`);
    expect(itemEditPath("a/b", "c d")).toBe("/k/a%2Fb/i/c%20d/edit");
  });
});

/** Stand-in for the editor: local state that must survive the address change (no remount). */
const NewItemEditor = () => {
  const { spaceId: space = "" } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  return (
    <div>
      <p>Mục mới</p>
      <input aria-label="Tiêu đề" value={title} onChange={(event) => setTitle(event.target.value)} />
      <button
        type="button"
        onClick={() => {
          adoptAutoDraft({ userId, spaceId: space, itemId });
          setCreated(itemId);
        }}
      >
        Chèn ảnh
      </button>
      <button type="button" onClick={() => void navigate(`/k/${space}/i/${created ?? ""}`, { replace: true })}>
        Lưu phiên bản
      </button>
    </div>
  );
};

/** The app's routes for these screens, over the browser history (same history API as the app's data router). */
const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/k/:spaceId/new" element={<NewItemEditor />} />
      <Route path="/k/:spaceId/i/:itemId/edit" element={<p>Sửa mục đã lưu nháp</p>} />
      <Route path="/k/:spaceId/i/:itemId" element={<p>Trang mục</p>} />
    </Routes>
  </BrowserRouter>
);

describe("auto-saved draft with the browser history", () => {
  it("keeps the editor mounted, then a reload opens the item's editor and saving still navigates", async () => {
    window.history.replaceState(null, "", `/k/${spaceId}/new`);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Đang soạn" } });

    fireEvent.click(screen.getByText("Chèn ảnh"));

    expect(window.location.pathname).toBe(`/k/${spaceId}/i/${itemId}/edit`);
    // Same instance: the typed title is still there, nothing remounted.
    expect(screen.getByText("Mục mới")).toBeTruthy();
    expect(screen.getByLabelText("Tiêu đề")).toBe(screen.getByDisplayValue("Đang soạn"));

    // "Lưu phiên bản" replaces the entry with the item page, as before.
    await act(async () => {
      fireEvent.click(screen.getByText("Lưu phiên bản"));
      await Promise.resolve();
    });
    expect(await screen.findByText("Trang mục")).toBeTruthy();
    expect(window.location.pathname).toBe(`/k/${spaceId}/i/${itemId}`);
    cleanup();

    // A reload right after the auto-save opens the saved draft item's editor, not an empty "Mục mới" form.
    window.history.replaceState(null, "", itemEditPath(spaceId, itemId));
    render(<App />);
    expect(await screen.findByText("Sửa mục đã lưu nháp")).toBeTruthy();
    expect(screen.queryByText("Mục mới")).toBeNull();
  });
});
