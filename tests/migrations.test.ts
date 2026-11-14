import { describe, expect, it } from "vitest";
import { FakeD1 } from "./support/fake-d1";

describe("0002_welcomed_role", () => {
  it("marks everyone already linked as welcomed in their current role, and nobody else", () => {
    const db = new FakeD1(1);
    db.exec("INSERT INTO members (username, role, tg_id) VALUES ('yusif', 'mentee', 1000)");
    db.exec("INSERT INTO members (username, role, tg_id) VALUES ('leyla', 'mentor', 50)");
    db.exec("INSERT INTO members (username, role) VALUES ('murad', 'mentee')");
    db.migrate();

    expect(db.query("SELECT username, welcomed_role FROM members ORDER BY username")).toEqual([
      { username: "leyla", welcomed_role: "mentor" },
      { username: "murad", welcomed_role: null },
      { username: "yusif", welcomed_role: "mentee" },
    ]);
  });
});
