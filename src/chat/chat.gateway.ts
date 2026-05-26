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
  const pubKey = this.config.get<string>('paystackPublic')?.trim();
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

    // 🔁 Reset session to main menu on every page load
    session.currentStep = 'mainMenu';
    session.temporaryData = {};
    await session.save();
    // Send welcome message
    // Send the main menu as structured data
    const mainMenuData = {
      type: 'mainMenu',
      text: 'Welcome! Choose an option:',
      buttons: [
        { id: '1', label: '🍔 Place an Order' },
        { id: '99', label: '🧾 Checkout' },
        { id: '98', label: '📜 Order History' },
        { id: '97', label: '🛒 Current Order' },
        { id: '0', label: '❌ Cancel Order' },
      ],
    };

    client.send(JSON.stringify({
      type: 'botMessage',
      data: mainMenuData,          // ✅ nested correctly
    }));

    // Also send deviceId back
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
    console.log('🌐 Gateway response:', JSON.stringify(response));

    // Send the structured message to the client
    client.send(JSON.stringify({ 
      type: 'botMessage', 
      data: response,
     }));

    //  Handle payment separately if it's a checkout response
    if (response.type === 'checkout' && response.orderSummary) {
      const order = await this.ordersService.findCurrentOrder(session.deviceId, 'placed');
      if (order) {
        // Generate a unique reference for each payment attempt
        const uniqueRef = `${order._id.toString()}-${Date.now()}`;
        console.log('💳 Generated payment reference:', uniqueRef);

        client.send(JSON.stringify({
          type: 'paymentRequired',
          orderId: order._id.toString(),
          amount: order.total,
          email: 'customer@example.com',
          publicKey: this.paystackPublic,
          reference: uniqueRef,
        }));
      }
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
      console.log('🔐 Verifying payment for reference:', data.reference, 'orderId:', data.orderId);

      const verification = await this.paymentService.verifyPayment(data.reference);
      console.log('📋 Paystack verification response:', JSON.stringify(verification));

      if (verification.data.status === 'success') {
        console.log('✅ Payment verified, updating order...');

      
        // Update order to paid
        const updatedOrder = await this.ordersService.updateOrderStatus(
          data.orderId, 
          'paid', 
          data.reference,
        );

        console.log('📦 Order updated:', updatedOrder?._id, 'new status:', updatedOrder?.status);

        // Reset session
        await this.sessionsService.updateSession(deviceId, {
          currentStep: 'mainMenu',
          currentOrder: null,
          temporaryData: {},
        });

        // Send main menu with success message
        client.send(JSON.stringify({
          type: 'botMessage',
          data: {
            type: 'mainMenu',
            text: '✅ Payment successful! Your order has been placed.',
            buttons: [
              { id: '1', label: '🍔 Place an Order' },
              { id: '99', label: '🧾 Checkout' },
              { id: '98', label: '📜 Order History' },
              { id: '97', label: '🛒 Current Order' },
              { id: '0', label: '❌ Cancel Order' },
            ],
          },
        }));
      } else {
        // Payment failed
        console.log('❌ Paystack verification not successful:', verification.data);
        client.send(JSON.stringify({
          type: 'botMessage',
          data: { type: 'text', text: 'Payment failed. Try again.' },
        }));
      }
    } catch (err) {
      // Network or verification error
      console.error('💥 Payment verification error:', err);
      client.send(JSON.stringify({
        type: 'botMessage',
        data: { type: 'text', text: 'Payment verification error. Please try again later.' },
      }));
    }
  }
}