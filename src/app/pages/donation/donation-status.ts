import { DonationGoalDto } from './donation-goal';

export interface DonationStatusDto {
  currentDonations: number;
  goals: DonationGoalDto[];
}