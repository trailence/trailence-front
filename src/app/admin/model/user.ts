import { UserQuotas } from '@trailence/services/auth/user-quotas';

export interface UserDto {
  email: string;
  createdAt: number;
  complete: boolean;
  admin: boolean;
  roles: string[];
  invalidLoginAttempts: number;
  lastLogin?: number;
  minAppVersion?: number;
  maxAppVersion?: number;
  quotas: UserQuotas;
}
