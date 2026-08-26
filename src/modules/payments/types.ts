export interface PaymentRequest {
  amount: number;
  phone: string;
  accountReference?: string;
  description?: string;
}

export interface PaymentResponse {
  success: boolean;
  data: any;
  message?: string;
}

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
}
