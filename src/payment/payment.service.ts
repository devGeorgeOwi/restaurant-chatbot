import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class PaymentService {
  private readonly secretKey: string;

  constructor(private config: ConfigService) {
    const key = this.config.get<string>('paystackSecret');
    if (!key) {
      throw new Error('PAYSTACK_SECRET_KEY is not defined in environment variables');
    }
    this.secretKey = key;
  }

  async verifyPayment(reference: string) {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${this.secretKey}` } }
    );
    return response.data;
  }
}