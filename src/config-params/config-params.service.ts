import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigParam } from './entities/config-param.entity';
import { UpdateParamDto, CreateParamDto } from './dto/update-param.dto';

export interface MutationResult {
  key: string;
  before: Partial<ConfigParam>;
  after: Partial<ConfigParam>;
  mutatedFields: string[];
}

@Injectable()
export class ConfigParamsService {
  private readonly logger = new Logger(ConfigParamsService.name);

  constructor(
    @InjectRepository(ConfigParam)
    private readonly repo: Repository<ConfigParam>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateParamDto): Promise<ConfigParam> {
    const existing = await this.repo.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException(`Config key "${dto.key}" already exists`);
    }
    const param = this.repo.create({ key: dto.key, value: dto.value, description: dto.description ?? null });
    return this.repo.save(param);
  }

  async findAll(): Promise<ConfigParam[]> {
    return this.repo.find({ order: { key: 'ASC' } });
  }

  async findOne(key: string): Promise<ConfigParam> {
    const param = await this.repo.findOne({ where: { key } });
    if (!param) throw new NotFoundException(`Config key "${key}" not found`);
    return param;
  }

  /**
   * Safely mutate ONLY the allowed fields (value, description) within a
   * transaction. After the update, the service compares pre/post state and
   * verifies that no unintended column changed. If the diff is unexpected the
   * transaction is rolled back.
   */
  async safeUpdate(key: string, dto: UpdateParamDto): Promise<MutationResult> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Lock the row for update — prevents concurrent side-effects
      const before = await manager
        .getRepository(ConfigParam)
        .createQueryBuilder('p')
        .where('p.key = :key', { key })
        .setLock('pessimistic_write')
        .getOne();

      if (!before) throw new NotFoundException(`Config key "${key}" not found`);
      if (before.isReadonly) throw new ForbiddenException(`Config key "${key}" is read-only`);

      const preSnapshot = { value: before.value, description: before.description };

      // 2. Apply only whitelisted fields — no spread of the full dto
      const allowedUpdates: Partial<ConfigParam> = {};
      if (dto.value !== undefined) allowedUpdates.value = dto.value;
      if (dto.description !== undefined) allowedUpdates.description = dto.description;

      if (Object.keys(allowedUpdates).length === 0) {
        throw new BadRequestException('No valid fields provided for update');
      }

      await manager.getRepository(ConfigParam).update({ key }, allowedUpdates);

      // 3. Reload and verify the diff
      const after = await manager.getRepository(ConfigParam).findOne({ where: { key } });
      if (!after) throw new NotFoundException('Config row disappeared during update');

      const postSnapshot = { value: after.value, description: after.description };

      // 4. Check for unexpected mutations (fields we didn't intend to change)
      const mutatedFields: string[] = [];
      const unexpectedChanges: string[] = [];

      const allTrackedFields = ['value', 'description', 'key', 'isReadonly'] as const;

      for (const field of allTrackedFields) {
        const changed = String(before[field]) !== String(after[field]);
        if (changed) {
          if (field in allowedUpdates) {
            mutatedFields.push(field);
          } else {
            unexpectedChanges.push(field);
          }
        }
      }

      if (unexpectedChanges.length > 0) {
        // Roll back by throwing — the transaction wraps this in a rollback
        this.logger.error(
          `Unexpected mutation detected for key "${key}": ${unexpectedChanges.join(', ')}`,
        );
        throw new BadRequestException(
          `Transaction aborted: unexpected field changes detected (${unexpectedChanges.join(', ')})`,
        );
      }

      this.logger.log(`Config "${key}" safely updated: changed [${mutatedFields.join(', ')}]`);

      return {
        key,
        before: preSnapshot,
        after: postSnapshot,
        mutatedFields,
      };
    });
  }
}
