export interface ContactMessageDto {
  uuid: string;
  email: string;
  type: string;
  message: string;
  sentAt: number;
  read: boolean;
}