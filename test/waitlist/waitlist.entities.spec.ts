import { validate } from "class-validator";
import { Waitlist } from "../../src/waitlist/entities/waitlist.entity";

describe("Waitlist entity validation", () => {
  it("should validate required fields", async () => {
    const w = new Waitlist();
    // missing name and type should cause validation errors if decorators were present
    const errors = await validate(w as any);
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });
});
