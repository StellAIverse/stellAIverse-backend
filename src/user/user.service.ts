import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./entities/user.entity";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserRole } from "./entities/user.entity";

/** Pairs of roles that are mutually exclusive */
const CONFLICTING_ROLE_PAIRS: [UserRole, UserRole][] = [
  [UserRole.GOVERNANCE_OPERATOR, UserRole.KYC_OPERATOR],
];

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  create(createUserDto: CreateUserDto) {
    return this.userRepository.save(createUserDto);
  }

  findAll() {
    return this.userRepository.find();
  }

  findOne(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.userRepository.update(id, updateUserDto);
    return this.findOne(id);
  }

  remove(id: string) {
    return this.userRepository.delete(id);
  }

  /**
   * Assign a role to a user. Enforces mutual exclusion between
   * GOVERNANCE_OPERATOR and KYC_OPERATOR — assigning one while the
   * other is already held throws a BadRequestException.
   */
  async assignRole(userId: string, newRole: UserRole): Promise<User> {
    const user = await this.findOne(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    this.assertNoRoleConflict(user.role, newRole);

    user.role = newRole;
    return this.userRepository.save(user);
  }

  /**
   * Throws BadRequestException if assigning `newRole` to a user that
   * currently holds `currentRole` would create a conflicting pair.
   */
  assertNoRoleConflict(currentRole: UserRole, newRole: UserRole): void {
    if (currentRole === newRole) return;

    const conflict = CONFLICTING_ROLE_PAIRS.some(
      ([a, b]) =>
        (currentRole === a && newRole === b) ||
        (currentRole === b && newRole === a),
    );

    if (conflict) {
      throw new BadRequestException(
        `Role conflict: a user cannot hold both "${currentRole}" and "${newRole}". ` +
          `GOVERNANCE_OPERATOR and KYC_OPERATOR are mutually exclusive roles.`,
      );
    }
  }
}
