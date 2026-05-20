import { Injectable } from '@nestjs/common';
import { MenuService } from '../menu/menu.service';
import { OrdersService } from '../orders/orders.service';
import { SessionsService } from '../sessions/sessions.service';
import { Session } from '../sessions/schemas/session.schema';

@Injectable()
export class BotService {
  constructor(
    private menuService: MenuService,
    private ordersService: OrdersService,
    private sessionsService: SessionsService,
  ) {}

  async processMessage(message: string, session: Session): Promise<any> {
    const input = message.trim();
    const step = session.currentStep;

    // Global commands
    if (input === '0') return this.cancelOrder(session);
    if (input === '98') return this.orderHistory(session);
    if (input === '97') return this.currentOrderStatus(session);
    if (input === '99') return this.checkout(session);
    if (input === '1' && step !== 'placingOrder' && step !== 'awaitingQuantity') {
      return this.startPlacingOrder(session);
    }

    switch (step) {
      case 'mainMenu':
        return this.mainMenuResponse();
      case 'placingOrder':
        return this.handleItemSelection(input, session);
      case 'awaitingQuantity':
        return this.handleQuantityInput(input, session);
      default:
        return { message: 'Invalid option. Please select from the menu.' };
    }
  }

  private mainMenuResponse() {
    return {
      message: `Welcome! Choose an option:\n1. Place an order\n99. Checkout order\n98. Order history\n97. Current order\n0. Cancel order`,
    };
  }

  private async startPlacingOrder(session: Session) {
    const menu = await this.menuService.getAvailableMenu();
    if (menu.length === 0) return { message: 'Menu is empty.' };
    const menuList = menu.map((item, idx) =>
      `${idx + 1}. ${item.name} - ₦${(item.price / 100).toFixed(2)}`
    ).join('\n');
    session.currentStep = 'placingOrder';
    session.temporaryData = { menu };
    await this.sessionsService.updateSession(session.deviceId, session);
    return { message: `Here is our menu:\n${menuList}\n\nReply with the item number.` };
  }

  private async handleItemSelection(input: string, session: Session) {
    const menu = session.temporaryData?.menu;
    if (!menu) return this.startPlacingOrder(session);
    const itemIndex = parseInt(input, 10) - 1;
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= menu.length) {
      return { message: 'Invalid item number.' };
    }
    const chosen = menu[itemIndex];
    session.temporaryData.pendingItem = {
      menuItemId: chosen._id,
      name: chosen.name,
      price: chosen.price,
    };
    session.currentStep = 'awaitingQuantity';
    await this.sessionsService.updateSession(session.deviceId, session);
    return { message: `How many ${chosen.name}? (Enter a number)` };
  }

  private async handleQuantityInput(input: string, session: Session) {
    const quantity = parseInt(input, 10);
    if (isNaN(quantity) || quantity < 1) {
      return { message: 'Enter a valid quantity (1 or more).' };
    }
    const pending = session.temporaryData?.pendingItem;
    if (!pending) {
      session.currentStep = 'placingOrder';
      await this.sessionsService.updateSession(session.deviceId, session);
      return { message: 'Something went wrong. Please select an item again.' };
    }
    const order = await this.ordersService.createOrUpdateOrder(session.deviceId, {
      menuItem: pending.menuItemId,
      quantity,
      priceAtOrder: pending.price,
    });
    session.currentOrder = order._id;
    session.currentStep = 'placingOrder';
    session.temporaryData.pendingItem = undefined;
    await this.sessionsService.updateSession(session.deviceId, session);
    return {
      message: `${quantity}x ${pending.name} added. Select another item, or:\n99 - Checkout\n97 - Current order\n0 - Cancel`,
    };
  }

  private async checkout(session: Session) {
    const order = await this.ordersService.findCurrentOrder(session.deviceId, 'pending');
    if (!order || order.items.length === 0) {
      return { message: 'No order to place. Enter 1 to start a new order.' };
    }
    order.status = 'placed'; // mark as placed before payment
    await order.save();
    session.currentStep = 'checkout';
    await this.sessionsService.updateSession(session.deviceId, session);
    return {
      message: `Order: ${order.items.map(i => `${i.quantity}x ${(i.menuItem as any).name}`).join(', ')}\nTotal: ₦${(order.total / 100).toFixed(2)}\nClick the payment button to pay.`,
      paymentRequired: true,
      orderId: order._id.toString(),
      amount: order.total,
      email: 'customer@example.com', // in production, ask for email earlier
    };
  }

  private async cancelOrder(session: Session) {
    if (session.currentOrder) {
      await this.ordersService.cancelOrder(session.currentOrder.toString());
    }
    session.currentOrder = null;
    session.currentStep = 'mainMenu';
    session.temporaryData = {};
    await this.sessionsService.updateSession(session.deviceId, session);
    return { message: 'Order cancelled. Enter 1 to start a new order.' };
  }

  private async orderHistory(session: Session) {
    const orders = await this.ordersService.getOrderHistory(session.deviceId);
    if (orders.length === 0) return { message: 'No order history.' };
    const list = orders.map(o =>
      `Order ${o._id.toString().slice(-4)}: ${o.items.map(i => `${i.quantity}x ${(i.menuItem as any).name}`).join(', ')} | Total: ₦${(o.total / 100).toFixed(2)} | Status: ${o.status}`
    ).join('\n\n');
    return { message: `Your order history:\n${list}` };
  }

  private async currentOrderStatus(session: Session) {
    const order = await this.ordersService.findCurrentOrder(session.deviceId, session.currentStep === 'checkout' ? 'placed' : 'pending');
    if (!order) return { message: 'No current order. Enter 1 to place one.' };
    const items = order.items.map(i => `${i.quantity}x ${(i.menuItem as any).name}`).join('\n');
    return {
      message: `Current order:\n${items}\nTotal: ₦${(order.total / 100).toFixed(2)} (Status: ${order.status})\n\n99 - Checkout\n0 - Cancel`,
    };
  }
}