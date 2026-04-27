import { DataSource } from "typeorm";
import { User, UserRole } from "../user/entities/user.entity";

/**
 * Seed script to assign roles to existing users.
 *
 * Usage:
 *   npx ts-node src/seeds/seed-roles.ts
 *
 * Or integrate into your application bootstrap.
 */
async function seedRoles(dataSource: DataSource) {
  const userRepository = dataSource.getRepository(User);

  // Ensure all existing users without a role get the default 'user' role
  await userRepository
    .createQueryBuilder()
    .update(User)
    .set({ role: UserRole.USER })
    .where("role IS NULL")
    .execute();

  console.log("✅ Default roles assigned to users without a role.");

  // Example: Promote a specific wallet address to admin
  // Uncomment and modify the address below to seed an admin user:
  //
  // const adminAddress = '0xYourAdminWalletAddress'.toLowerCase();
  // const adminUser = await userRepository.findOne({
  //   where: { walletAddress: adminAddress },
  // });
  // if (adminUser) {
  //   adminUser.role = UserRole.ADMIN;
  //   await userRepository.save(adminUser);
  //   console.log(`✅ Admin role assigned to ${adminAddress}`);
  // } else {
  //   console.log(`⚠️  User with address ${adminAddress} not found.`);
  // }

  console.log("🎉 Role seeding complete.");
}

export { seedRoles };
