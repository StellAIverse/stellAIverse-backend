// src/observability/http-metrics.interceptor.ts

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = (Date.now() - start) / 1000;

        this.metrics.httpRequestsTotal.inc({
          method: req.method,
          route: req.route?.path || req.url,
          status: res.statusCode,
        });

        this.metrics.httpRequestDuration.observe(
          {
            method: req.method,
            route: req.route?.path || req.url,
            status: res.statusCode,
          },
          duration,
        );
      }),
    );
  }
}