import { Injectable } from '@nestjs/common';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CursorPaginationDto, PaginationResult, CursorOptions } from './cursor-pagination.dto';

@Injectable()
export class CursorPaginationService {
  /**
   * Creates a cursor-based pagination query
   */
  createCursorQuery<T>(
    queryBuilder: SelectQueryBuilder<T>,
    options: CursorOptions,
  ): SelectQueryBuilder<T> {
    const { cursor, limit, direction, orderBy, orderDirection } = options;
    
    // Add ordering
    queryBuilder.orderBy(`${queryBuilder.alias}.${orderBy}`, orderDirection);
    
    // Add cursor condition if provided
    if (cursor) {
      const operator = this.getCursorOperator(direction, orderDirection);
      queryBuilder.andWhere(`${queryBuilder.alias}.${orderBy} ${operator} :cursor`, {
        cursor: this.decodeCursor(cursor),
      });
    }
    
    // Add secondary ordering for consistent results
    if (orderBy !== 'id') {
      queryBuilder.addOrderBy(`${queryBuilder.alias}.id`, orderDirection);
    }
    
    // Apply limit with buffer for determining if there are more results
    queryBuilder.limit(limit + 1);
    
    return queryBuilder;
  }
  
  /**
   * Executes cursor-based pagination and formats results
   */
  async paginateWithCursor<T>(
    repository: Repository<T>,
    options: CursorOptions,
    additionalConditions?: (qb: SelectQueryBuilder<T>) => SelectQueryBuilder<T>,
  ): Promise<PaginationResult<T>> {
    const alias = repository.metadata.tableName;
    let queryBuilder = repository.createQueryBuilder(alias);
    
    // Apply additional conditions if provided
    if (additionalConditions) {
      queryBuilder = additionalConditions(queryBuilder);
    }
    
    // Apply cursor pagination
    queryBuilder = this.createCursorQuery(queryBuilder, options);
    
    // Execute query
    const results = await queryBuilder.getMany();
    
    // Determine if there are more results
    const hasMore = results.length > options.limit;
    const hasPrevious = !!options.cursor;
    
    // Remove the extra item used to determine if there are more results
    if (hasMore) {
      results.pop();
    }
    
    // Reverse results if going backward
    if (options.direction === 'backward') {
      results.reverse();
    }
    
    // Generate cursors
    const nextCursor = hasMore ? this.encodeCursor(results[results.length - 1]) : undefined;
    const prevCursor = hasPrevious ? this.encodeCursor(results[0]) : undefined;
    
    return {
      data: results,
      nextCursor,
      prevCursor,
      hasMore,
      hasPrevious,
    };
  }
  
  /**
   * Encodes a value to a cursor
   */
  private encodeCursor(item: any): string {
    if (!item) return '';
    return Buffer.from(JSON.stringify({
      id: item.id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })).toString('base64');
  }
  
  /**
   * Decodes a cursor to a value
   */
  private decodeCursor(cursor: string): any {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      return decoded.createdAt || decoded.id;
    } catch (error) {
      throw new Error('Invalid cursor format');
    }
  }
  
  /**
   * Gets the appropriate SQL operator based on direction and order
   */
  private getCursorOperator(
    direction: 'forward' | 'backward',
    orderDirection: 'ASC' | 'DESC',
  ): string {
    if (direction === 'forward') {
      return orderDirection === 'ASC' ? '>' : '<';
    } else {
      return orderDirection === 'ASC' ? '<' : '>';
    }
  }
  
  /**
   * Creates a cursor from a specific value
   */
  createCursorFromValue(value: any): string {
    return Buffer.from(JSON.stringify(value)).toString('base64');
  }
  
  /**
   * Validates cursor format
   */
  validateCursor(cursor: string): boolean {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString();
      JSON.parse(decoded);
      return true;
    } catch {
      return false;
    }
  }
}
