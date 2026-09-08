export type ShareValidity = {
  url: string;
  expiresAt: string;
  onExpired: (message: string) => void;
};
