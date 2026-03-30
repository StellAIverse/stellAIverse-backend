// test/oracle/submission-verifier.e2e-spec.ts

import request from "supertest";

describe("Submission Verifier", () => {
  it("should return status", async () => {
    const res = await request(global.app.getHttpServer())
      .get("/verifier/status")
      .expect(200);

    expect(res.body.running).toBeDefined();
  });

  it("should return logs", async () => {
    const res = await request(global.app.getHttpServer())
      .get("/verifier/logs")
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});
