import { Test, TestingModule } from "@nestjs/testing";
import { DatabaseHealthIndicator } from "./database.health-indicator";
import { DataSource } from "typeorm";
import { HealthCheckError } from "@nestjs/terminus";

describe("DatabaseHealthIndicator", () => {
  let indicator: DatabaseHealthIndicator;
  let dataSource: DataSource;

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthIndicator,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    indicator = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
    dataSource = module.get<DataSource>(DataSource);

    jest.clearAllMocks();
  });

  describe("isHealthy", () => {
    it("should return healthy status when database query succeeds", async () => {
      mockDataSource.query.mockResolvedValue([{ "?column?": 1 }]);

      const result = await indicator.isHealthy("database");

      expect(result).toEqual({
        database: {
          status: "up",
          message: "Database connection is healthy",
        },
      });
      expect(mockDataSource.query).toHaveBeenCalledWith("SELECT 1");
    });

    it("should throw HealthCheckError when database query fails", async () => {
      const error = new Error("Connection refused");
      mockDataSource.query.mockRejectedValue(error);

      await expect(indicator.isHealthy("database")).rejects.toThrow(
        HealthCheckError,
      );
    });

    it("should include error message in failed health check", async () => {
      const errorMessage = "Connection timeout";
      mockDataSource.query.mockRejectedValue(new Error(errorMessage));

      try {
        await indicator.isHealthy("database");
        fail("Expected HealthCheckError to be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        expect(error.causes).toEqual({
          database: {
            status: "down",
            message: `Database connection failed: ${errorMessage}`,
          },
        });
      }
    });
  });
});
