export interface UserDto {
  email: string;
  createdAt: number;
  complete: boolean;
  admin: boolean;
  invalidLoginAttempts: number;
  lastLogin?: number;
  minAppVersion?: number;
  maxAppVersion?: number;
}
