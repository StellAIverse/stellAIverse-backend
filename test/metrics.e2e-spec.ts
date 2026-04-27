// test/observability/metrics.e2e-spec.ts

import request from 'supertest';

describe('Metrics (e2e)', () => {
  it('/metrics (GET)', async () => {
    const res = await request(global.app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(res.text).toContain('http_requests_total');
  });
});