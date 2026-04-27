const { DataSource } = require("typeorm");
const dotenv = require("dotenv");
dotenv.config();

async function test() {
  const dataSource = new DataSource({
    type: "postgres",
    url:
      process.env.DATABASE_URL ||
      "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
    // Do not require entities for a simple connection test
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log("✅ Database connection successful");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message || err);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

test();
