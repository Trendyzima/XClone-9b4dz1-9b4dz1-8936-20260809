import axios from "axios";
import { MpesaConfig, PaymentResponse } from "./types";

export class MpesaService {
  private config: MpesaConfig;

  constructor(config: MpesaConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<string> {
    const auth = Buffer.from(
      `${this.config.consumerKey}:${this.config.consumerSecret}`
    ).toString("base64");

    const res = await axios.get(
      "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    return res.data.access_token;
  }

  public async stkPush(phone: string, amount: number): Promise<PaymentResponse> {
    try {
      const token = await this.getAccessToken();
      const timestamp = new Date()
        .toISOString()
        .replace(/[-T:.Z]/g, "")
        .slice(0, 14);

      const password = Buffer.from(
        `${this.config.shortcode}${this.config.passkey}${timestamp}`
      ).toString("base64");

      const payload = {
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: this.config.shortcode,
        PhoneNumber: phone,
        CallBackURL: this.config.callbackUrl,
        AccountReference: "XClone",
        TransactionDesc: "Payment",
      };

      const res = await axios.post(
        "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return {
        success: true,
        data: res.data,
      };
    } catch (error: any) {
      return {
        success: false,
        data: null,
        message: error.message,
      };
    }
  }
}