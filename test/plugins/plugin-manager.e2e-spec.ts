// test/plugins/plugin-manager.e2e-spec.ts

it("should register and activate plugin", async () => {
  await request(app.getHttpServer())
    .post("/plugins/register")
    .send({ id: "test", path: "./plugins/sample.plugin.js" });

  await request(app.getHttpServer())
    .post("/plugins/test/approve");

  await request(app.getHttpServer())
    .post("/plugins/test/activate");

  const res = await request(app.getHttpServer())
    .get("/plugins");

  expect(res.body.length).toBeGreaterThan(0);
});