export interface DonationDto {
  uuid: string;
  platform: string;
  platformId: string;

  timestamp: number;
  amount: number;
  realAmount: number;
  email: string;

  details: string | undefined | null;

}