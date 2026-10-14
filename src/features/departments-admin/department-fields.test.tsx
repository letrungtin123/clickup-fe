// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { Department } from "@/contracts/departments";

import { DepartmentFields } from "./department-fields";
import type { DepartmentDraft, DepartmentLocks } from "./department-form";

const Harness = ({
  initial,
  locks = {},
  before
}: {
  initial: DepartmentDraft;
  locks?: DepartmentLocks;
  before?: Department[];
}) => {
  const [value, setValue] = useState(initial);
  return (
    <DepartmentFields
      idPrefix="t"
      value={value}
      onChange={setValue}
      errors={{}}
      locks={locks}
      before={before}
    />
  );
};

const option = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const rolesRegion = () => document.getElementById("t-roles")?.closest("[inert]") ?? null;

afterEach(cleanup);

describe("DepartmentFields", () => {
  it("reveals the Photo Retouch roles only while Photo Retouch is ticked", () => {
    render(<Harness initial={{ departments: [], roles: ["STAFF"] }} />);
    expect(option("Photo Retouch").getAttribute("aria-pressed")).toBe("false");
    expect(rolesRegion()).not.toBeNull();

    fireEvent.click(option("Photo Retouch"));
    expect(option("Photo Retouch").getAttribute("aria-pressed")).toBe("true");
    expect(rolesRegion()).toBeNull();
    expect(screen.getByRole("button", { name: /Nhân viên/ }).getAttribute("aria-pressed")).toBe(
      "true"
    );

    fireEvent.click(option("Photo Retouch"));
    fireEvent.click(option("Production"));
    expect(option("Production").getAttribute("aria-pressed")).toBe("true");
    expect(rolesRegion()).not.toBeNull();
  });

  it("disables a department the caller is not in", () => {
    render(
      <Harness
        initial={{ departments: [], roles: [] }}
        locks={{ PRODUCTION: "Bạn không thuộc phòng ban Production" }}
      />
    );
    const production = option("Production");
    expect(production.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(production);
    expect(production.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Bạn chỉ thêm hoặc bỏ được phòng ban mà bạn thuộc về.")).toBeTruthy();
  });

  it("editing: warns before removing Photo Retouch, asks roles when it is newly added", () => {
    render(
      <Harness
        initial={{ departments: ["PHOTO_RETOUCH"], roles: ["STAFF"] }}
        before={["PHOTO_RETOUCH"]}
      />
    );
    // Already in Photo Retouch: no roles field, no warning.
    expect(rolesRegion()).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(option("Production"));
    fireEvent.click(option("Photo Retouch"));
    expect(screen.getByRole("status").textContent).toContain(
      "Bỏ Photo Retouch sẽ gỡ các vai trò Photo Retouch của người này."
    );
  });
});
