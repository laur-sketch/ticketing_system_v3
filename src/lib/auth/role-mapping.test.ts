import { describe, expect, it } from "vitest";
import { isHrisHeadTitle, mapHrisToPortalRole } from "@/lib/auth/role-mapping";

describe("mapHrisToPortalRole", () => {
  it("maps super_admin to SuperAdmin", () => {
    expect(mapHrisToPortalRole({ hrisRole: "super_admin" })).toEqual({
      portalRole: "SuperAdmin",
      headPrivileges: false,
    });
  });

  it("maps admin to Personnel unless head title", () => {
    expect(mapHrisToPortalRole({ hrisRole: "admin" })).toEqual({
      portalRole: "Personnel",
      headPrivileges: false,
    });
    expect(
      mapHrisToPortalRole({ hrisRole: "admin", position: "HR Team Head" }),
    ).toEqual({
      portalRole: "Admin",
      headPrivileges: true,
    });
  });

  it("maps employee to Personnel", () => {
    expect(mapHrisToPortalRole({ hrisRole: "employee" })).toEqual({
      portalRole: "Personnel",
      headPrivileges: false,
    });
  });

  it("elevates employee with team leader position to Admin", () => {
    expect(
      mapHrisToPortalRole({
        hrisRole: "employee",
        position: "IT & MIS UNIT TEAM LEADER",
        department: "IT DEPARTMENT",
      }),
    ).toEqual({
      portalRole: "Admin",
      headPrivileges: true,
    });
  });

  it("elevates employee with head position to Admin", () => {
    expect(
      mapHrisToPortalRole({ hrisRole: "employee", position: "IT Support Head" }),
    ).toEqual({
      portalRole: "Admin",
      headPrivileges: true,
    });
  });

  it("respects DB override mapping", () => {
    expect(
      mapHrisToPortalRole(
        { hrisRole: "employee" },
        { portalRole: "Customer", headPrivileges: false },
      ),
    ).toEqual({
      portalRole: "Customer",
      headPrivileges: false,
    });
  });
});

describe("isHrisHeadTitle", () => {
  it("detects head in position", () => {
    expect(isHrisHeadTitle({ hrisRole: "employee", position: "Finance Head" })).toBe(true);
  });

  it("detects leader in position", () => {
    expect(
      isHrisHeadTitle({ hrisRole: "employee", position: "IT & MIS UNIT TEAM LEADER" }),
    ).toBe(true);
  });

  it("detects head in compact titles", () => {
    expect(isHrisHeadTitle({ hrisRole: "employee", position: "Team Head-ACI" })).toBe(true);
  });

  it("returns false for regular titles", () => {
    expect(isHrisHeadTitle({ hrisRole: "employee", position: "Analyst" })).toBe(false);
  });
});
