import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { SimulatorModule } from '../../src/simulator/simulator.module';
import { EnvironmentLoaderService } from '../../src/simulator/environment-loader.service';
import { EnvironmentRegistryService } from '../../src/simulator/environment-registry.service';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('EnvironmentLoader (e2e)', () => {
  let app: INestApplication;
  let loaderService: EnvironmentLoaderService;
  let registryService: EnvironmentRegistryService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SimulatorModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    loaderService = moduleFixture.get<EnvironmentLoaderService>(EnvironmentLoaderService);
    registryService = moduleFixture.get<EnvironmentRegistryService>(EnvironmentRegistryService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up any loaded environments
    const environments = registryService.getAllEnvironments();
    for (const env of environments) {
      await loaderService.unloadEnvironment(env.metadata.id, env.metadata.version);
    }
    registryService.clearAuditLog();
  });

  describe('Environment Loading', () => {
    it('should load an environment from file path', async () => {
      const envPath = path.join(process.cwd(), 'simulation-environments', 'grid-world.environment.ts');
      
      const response = await request(app.getHttpServer())
        .post('/simulator/environments/load')
        .send({ path: envPath })
        .expect(201);

      expect(response.body.message).toBe('Environment loaded successfully');
      expect(response.body.environment).toBeDefined();
      expect(response.body.environment.id).toBe('grid-world');
      expect(response.body.environment.version).toBe('1.0.0');
    });

    it('should load multiple environments from directory', async () => {
      const dirPath = path.join(process.cwd(), 'simulation-environments');
      
      const response = await request(app.getHttpServer())
        .post('/simulator/environments/load-directory')
        .send({ path: dirPath })
        .expect(201);

      expect(response.body.environments).toBeDefined();
      expect(response.body.environments.length).toBeGreaterThanOrEqual(2);
    });

    it('should list available environments', async () => {
      // First load some environments
      const dirPath = path.join(process.cwd(), 'simulation-environments');
      await request(app.getHttpServer())
        .post('/simulator/environments/load-directory')
        .send({ path: dirPath })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/simulator/environments')
        .expect(200);

      expect(response.body.environments).toBeDefined();
      expect(response.body.environments.length).toBeGreaterThanOrEqual(2);
      expect(response.body.count).toBeGreaterThanOrEqual(2);
    });

    it('should get versions of a specific environment', async () => {
      const envPath = path.join(process.cwd(), 'simulation-environments', 'grid-world.environment.ts');
      await request(app.getHttpServer())
        .post('/simulator/environments/load')
        .send({ path: envPath })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/simulator/environments/grid-world/versions')
        .expect(200);

      expect(response.body.id).toBe('grid-world');
      expect(response.body.versions).toBeDefined();
      expect(response.body.versions.length).toBeGreaterThanOrEqual(1);
    });

    it('should unload an environment', async () => {
      const envPath = path.join(process.cwd(), 'simulation-environments', 'grid-world.environment.ts');
      await request(app.getHttpServer())
        .post('/simulator/environments/load')
        .send({ path: envPath })
        .expect(201);

      const response = await request(app.getHttpServer())
        .delete('/simulator/environments/grid-world/1.0.0')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Environment unloaded successfully');
    });
  });

  describe('Hot Reloading', () => {
    it('should enable hot-reloading for an environment', async () => {
      const envPath = path.join(process.cwd(), 'simulation-environments', 'grid-world.environment.ts');
      await request(app.getHttpServer())
        .post('/simulator/environments/load')
        .send({ path: envPath })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/hot-reload/enable')
        .send({})
        .expect(201);

      expect(response.body.message).toBe('Hot-reload enabled');
    });

    it('should disable hot-reloading for an environment', async () => {
      const envPath = path.join(process.cwd(), 'simulation-environments', 'grid-world.environment.ts');
      await request(app.getHttpServer())
        .post('/simulator/environments/load')
        .send({ path: envPath })
        .expect(201);

      await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/hot-reload/enable')
        .send({})
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/hot-reload/disable')
        .send({})
        .expect(201);

      expect(response.body.message).toBe('Hot-reload disabled');
    });

    it('should reload an environment manually', async () => {
      const envPath = path.join(process.cwd(), 'simulation-environments', 'grid-world.environment.ts');
      await request(app.getHttpServer())
        .post('/simulator/environments/load')
        .send({ path: envPath })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/reload')
        .expect(201);

      expect(response.body.message).toBe('Environment reloaded successfully');
      expect(response.body.environment).toBeDefined();
    });
  });

  describe('Environment Instances', () => {
    beforeEach(async () => {
      // Load environments for instance tests
      const dirPath = path.join(process.cwd(), 'simulation-environments');
      await request(app.getHttpServer())
        .post('/simulator/environments/load-directory')
        .send({ path: dirPath })
        .expect(201);
    });

    it('should create and initialize an environment instance', async () => {
      const response = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({
          seed: 12345,
          parameters: {
            width: 10,
            height: 10,
            obstacleDensity: 0.1,
          },
        })
        .expect(201);

      expect(response.body.message).toBe('Instance created and initialized successfully');
      expect(response.body.instanceId).toBeDefined();
      expect(response.body.success).toBe(true);
    });

    it('should list all instances', async () => {
      // Create an instance first
      await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/simulator/instances')
        .expect(200);

      expect(response.body.instances).toBeDefined();
      expect(response.body.count).toBeGreaterThanOrEqual(1);
    });

    it('should get a specific instance', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      const response = await request(app.getHttpServer())
        .get(`/simulator/instances/${instanceId}`)
        .expect(200);

      expect(response.body.instance).toBeDefined();
      expect(response.body.instance.instanceId).toBe(instanceId);
    });

    it('should run a simulation on an instance', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      const response = await request(app.getHttpServer())
        .post(`/simulator/instances/${instanceId}/run`)
        .send({
          maxSteps: 10,
        })
        .expect(200);

      expect(response.body.message).toBe('Simulation completed successfully');
      expect(response.body.result).toBeDefined();
      expect(response.body.result.steps).toBeGreaterThan(0);
    });

    it('should teardown an instance', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      const response = await request(app.getHttpServer())
        .delete(`/simulator/instances/${instanceId}`)
        .expect(200);

      expect(response.body.message).toBe('Instance torn down successfully');
    });
  });

  describe('Parallel Version Execution', () => {
    it('should run multiple versions in parallel', async () => {
      // Load environments
      const dirPath = path.join(process.cwd(), 'simulation-environments');
      await request(app.getHttpServer())
        .post('/simulator/environments/load-directory')
        .send({ path: dirPath })
        .expect(201);

      // Create instances of different environments
      const gridWorldResponse = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      const marketResponse = await request(app.getHttpServer())
        .post('/simulator/environments/market-simulation/1.0.0/instances')
        .send({ seed: 54321 })
        .expect(201);

      // Run both simulations
      const [gridResult, marketResult] = await Promise.all([
        request(app.getHttpServer())
          .post(`/simulator/instances/${gridWorldResponse.body.instanceId}/run`)
          .send({ maxSteps: 5 })
          .expect(200),
        request(app.getHttpServer())
          .post(`/simulator/instances/${marketResponse.body.instanceId}/run`)
          .send({ maxSteps: 5 })
          .expect(200),
      ]);

      expect(gridResult.body.result.success).toBe(true);
      expect(marketResult.body.result.success).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    beforeEach(async () => {
      const dirPath = path.join(process.cwd(), 'simulation-environments');
      await request(app.getHttpServer())
        .post('/simulator/environments/load-directory')
        .send({ path: dirPath })
        .expect(201);
    });

    it('should log all environment activities', async () => {
      // Create and run an instance
      const createResponse = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      await request(app.getHttpServer())
        .post(`/simulator/instances/${instanceId}/run`)
        .send({ maxSteps: 5 })
        .expect(200);

      // Check audit logs
      const response = await request(app.getHttpServer())
        .get('/simulator/audit-logs')
        .expect(200);

      expect(response.body.logs).toBeDefined();
      expect(response.body.logs.length).toBeGreaterThan(0);
      expect(response.body.count).toBeGreaterThan(0);
    });

    it('should get audit logs for a specific instance', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      const instanceId = createResponse.body.instanceId;

      await request(app.getHttpServer())
        .post(`/simulator/instances/${instanceId}/run`)
        .send({ maxSteps: 5 })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/simulator/instances/${instanceId}/audit-logs`)
        .expect(200);

      expect(response.body.instanceId).toBe(instanceId);
      expect(response.body.logs).toBeDefined();
      expect(response.body.logs.length).toBeGreaterThan(0);
    });

    it('should export audit logs', async () => {
      // Create and run an instance to generate logs
      const createResponse = await request(app.getHttpServer())
        .post('/simulator/environments/grid-world/1.0.0/instances')
        .send({ seed: 12345 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/simulator/instances/${createResponse.body.instanceId}/run`)
        .send({ maxSteps: 5 })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/simulator/audit-logs/export')
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.format).toBe('json');
      
      // Verify it's valid JSON
      const logs = JSON.parse(response.body.data);
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should provide environment and instance statistics', async () => {
      const dirPath = path.join(process.cwd(), 'simulation-environments');
      await request(app.getHttpServer())
        .post('/simulator/environments/load-directory')
        .send({ path: dirPath })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/simulator/statistics')
        .expect(200);

      expect(response.body.statistics).toBeDefined();
      expect(response.body.statistics.totalEnvironments).toBeGreaterThanOrEqual(2);
      expect(response.body.statistics.totalInstances).toBeDefined();
      expect(response.body.statistics.auditLogEntries).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle loading non-existent environment file', async () => {
      await request(app.getHttpServer())
        .post('/simulator/environments/load')
        .send({ path: '/non-existent/path/environment.ts' })
        .expect(500);
    });

    it('should handle operations on non-existent instance', async () => {
      await request(app.getHttpServer())
        .post('/simulator/instances/non-existent-id/run')
        .send({ maxSteps: 5 })
        .expect(500);
    });

    it('should handle unloading non-existent environment', async () => {
      const response = await request(app.getHttpServer())
        .delete('/simulator/environments/non-existent/1.0.0')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Environment not found');
    });
  });
});
