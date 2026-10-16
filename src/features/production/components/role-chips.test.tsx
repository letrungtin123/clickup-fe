// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { memberProductionRoleCodes } from "@/contracts/departments";
import { productionRoleCodes } from "@/contracts/production-catalog";

import {
  productionRoleColors,
  productionRoleDescriptions,
  productionRoleLabels,
  sortRoles
} from "../roles";
import { RoleBadge, RoleBadges, RoleToggleGroup } from "./role-chips";

afterEach(cleanup);

describe("Director (PD-065)", () => {
  it("is a production role with its label, colour and description", () => {
    expect(productionRoleCodes).toContain("DIRECTOR");
    // Cài đặt → Thành viên accepts the same codes.
    expect([...memberProductionRoleCodes]).toEqual([...productionRoleCodes]);
    expect(productionRoleLabels.DIRECTOR).toBe("Director");
    expect(productionRoleDescriptions.DIRECTOR).toBe(
      "Xem Bất thường và Quản trị số liệu; theo dõi toàn bộ số liệu."
    );
    expect(productionRoleColors.DIRECTOR).toBe("fuchsia");
    // Its own colour: no other role shares it.
    const colors = productionRoleCodes.map((role) => productionRoleColors[role]);
    expect(new Set(colors).size).toBe(colors.length);
    expect(sortRoles(["DIRECTOR", "STAFF", "ADMIN"])).toEqual(["ADMIN", "STAFF", "DIRECTOR"]);
  });

  it("shows as a badge with its description", () => {
    render(<RoleBadge role="DIRECTOR" />);
    const badge = screen.getByText("Director");
    expect(badge.getAttribute("title")).toBe(productionRoleDescriptions.DIRECTOR);
    cleanup();
    render(<RoleBadges roles={["DIRECTOR", "LEADER"]} />);
    expect(screen.getAllByText(/Leader|Director/).map((node) => node.textContent)).toEqual([
      "Leader",
      "Director"
    ]);
  });

  it("is a grantable chip of the role picker", () => {
    const onChange = vi.fn();
    render(<RoleToggleGroup aria-label="Vai trò" value={["STAFF"]} onChange={onChange} />);
    const chips = screen.getAllByRole("button");
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "Quản trị",
      "Account",
      "Leader",
      "QC",
      "Nhân viên",
      "Director"
    ]);
    const director = screen.getByRole("button", { name: "Director" });
    expect(director.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(director);
    expect(onChange).toHaveBeenCalledWith(["STAFF", "DIRECTOR"]);
  });
});
