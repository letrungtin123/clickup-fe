// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Link } from "@/components/shared/router-link";
import { afterEach, describe, expect, it } from "vitest";

import type { JobPeople } from "@/contracts/production-jobs";

import { JobPeopleStack } from "./job-people";

// Obviously fake ids and names (the repository is public).
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = (n: number, name: string) => ({
  id: id(n),
  displayName: name,
  email: null,
  avatarUrl: null
});

const people: JobPeople = {
  workers: [
    { user: user(1, "Worker One"), qty: 25, taskCount: 2 },
    { user: user(2, "Worker Two"), qty: 20, taskCount: 1 },
    { user: user(3, "Worker Three"), qty: 10, taskCount: 1 },
    { user: user(4, "Worker Four"), qty: 5, taskCount: 1 },
    { user: user(5, "Worker Five"), qty: 3, taskCount: 1 },
    { user: user(6, "Worker Six"), qty: 1, taskCount: 1 }
  ],
  qc: [user(7, "Checker Seven")]
};

/** The job list row is a link: the stack lives inside it. */
const renderInRow = (value: JobPeople, showCount = false) => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <Link to="/job" data-testid="row">
            <JobPeopleStack people={value} showCount={showCount} />
          </Link>
        )
      },
      { path: "/job", element: <p>job page</p> }
    ],
    { initialEntries: ["/"] }
  );
  render(<RouterProvider router={router} />);
  return router;
};

afterEach(cleanup);

describe("JobPeopleStack (job list Người làm)", () => {
  it("shows at most 4 avatars then +N, and the count on cards", () => {
    renderInRow(people, true);
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText("6 người làm")).toBeTruthy();
  });

  it("a tap opens the list (workers with images, QC below) without opening the job", async () => {
    const router = renderInRow(people);
    const trigger = screen.getByRole("button", { name: /^Người làm: Worker One, Worker Two/ });
    await act(async () => {
      fireEvent.click(trigger);
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/");
    expect(await screen.findByText("Người làm · 6")).toBeTruthy();
    expect(screen.getByText("· 25 tấm")).toBeTruthy();
    expect(screen.getByText("Worker Six")).toBeTruthy();
    expect(screen.getByText("QC · 1")).toBeTruthy();
    expect(screen.getByText("Checker Seven")).toBeTruthy();
    // A click inside the (portaled) list stays there too.
    await act(async () => {
      fireEvent.click(screen.getByText("Checker Seven"));
      await Promise.resolve();
    });
    expect(router.state.location.pathname).toBe("/");
  });

  it("a job not split yet shows a dash", () => {
    renderInRow({ workers: [], qc: [] });
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
