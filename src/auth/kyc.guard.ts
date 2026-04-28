import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

@Injectable()
export class KycGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const skipKyc = this.reflector.get<boolean>('skipKyc', context.getHandler());
    if (skipKyc) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check if the user has completed KYC
    return user?.kycVerified === true;
  }
}