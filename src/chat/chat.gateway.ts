import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { BotService } from './bot.service';
import { SessionsService } from '../sessions/sessions.service';
import { PaymentService } from '../payment/payment.service';
import { OrdersService } from '../orders/orders.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({ path: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Track deviceId per connection
  private clients = new Map<WebSocket, string>();

// Add property
private paystackPublic: string;

  constructor(
  private botService: BotService,
  private sessionsService: SessionsService,
  private paymentService: PaymentService,
  private ordersService: OrdersService,
  private config: ConfigService,
) {
  const pubKey = this.config.get<string>('paystackPublic');
  if (!pubKey) {
    throw new Error('PAYSTACK_PUBLIC_KEY is missing in environment variables');
  }
  this.paystackPublic = pubKey;
}

  handleConnection(client: WebSocket) {
    // Connection opened, wait for init message
  }

  handleDisconnect(client: WebSocket) {
    this.clients.delete(client);
  }

  @SubscribeMessage('init')
  async handleInit(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { deviceId?: string },
  ) {
    let deviceId = data.deviceId || uuidv4();
    this.clients.set(client, deviceId);
    const session = await this.sessionsService.findOrCreate(deviceId);
    // Send welcome message
    const response = await this.botService.processMessage('1', session); // trigger main menu indirectly
    // Actually we want just the main menu, not '1' command. Better: call a dedicated method.
    // We'll send directly:
    client.send(JSON.stringify({
      type: 'botMessage',
      message: `Welcome! Choose an option:\n1. Place an order\n99. Checkout order\n98. Order history\n97. Current order\n0. Cancel order`,
    }));
    // Also send deviceId back so client can store it
    client.send(JSON.stringify({ type: 'deviceId', deviceId }));
  }

  @SubscribeMessage('message')
  async handleMessage(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { text: string },
  ) {
    const deviceId = this.clients.get(client);
    if (!deviceId) return;
    const session = await this.sessionsService.findOrCreate(deviceId);
    const response = await this.botService.processMessage(data.text, session);
    client.send(JSON.stringify({ type: 'botMessage', ...response }));

    if (response.paymentRequired) {
      client.send(JSON.stringify({
        type: 'paymentRequired',
        orderId: response.orderId,
        amount: response.amount,
        email: response.email,
        publicKey: this.paystackPublic,
      }));
    }
  }

  @SubscribeMessage('paymentSuccess')
    async handlePaymentSuccess(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { reference: string; orderId: string },
    ) {
    const deviceId = this.clients.get(client);
    if (!deviceId) {
        client.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
        return;
    }

    try {
        const verification = await this.paymentService.verifyPayment(data.reference);
        if (verification.data.status === 'success') {
        await this.ordersService.updateOrderStatus(data.orderId, 'paid', data.reference);
        await this.sessionsService.updateSession(deviceId, {
            currentStep: 'mainMenu',
            currentOrder: null,
            temporaryData: {},
        });
        client.send(JSON.stringify({
            type: 'botMessage',
            message: 'Payment successful! Your order has been placed.\n1 - Place another order',
        }));
        } else {
        client.send(JSON.stringify({ type: 'botMessage', message: 'Payment failed. Try again.' }));
        }
    } catch (err) {
        client.send(JSON.stringify({ type: 'botMessage', message: 'Payment verification error.' }));
    }
    }
}