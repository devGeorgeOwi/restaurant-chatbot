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

    // ---- GLOBAL COMMANDS (work from any step) ----
    if (input === '0') return this.cancelOrder(session);
    if (input === '98') return this.orderHistory(session);
    if (input === '97') return this.currentOrderStatus(session);
    if (input === '99') return this.checkout(session);
    if (input === '1' && step !== 'placingOrder' && step !== 'awaitingQuantity') {
      return this.startPlacingOrder(session);
    }

    // ---- STEP-SPECIFIC LOGIC ----
    switch (step) {
      case 'mainMenu':
        return this.mainMenuResponse();
      case 'placingOrder':
        return this.handleItemSelection(input, session);
      case 'awaitingQuantity':
        return this.handleQuantityInput(input, session);
      default:
        return { type: 'text', text: 'Invalid option. Please select from the menu.' };
    }
  }

  // ==================== RESPONSE BUILDERS ====================

  private mainMenuResponse() {
    return {
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
  }

  private async startPlacingOrder(session: Session) {
    const menu = await this.menuService.getAvailableMenu();
    if (menu.length === 0) return { type: 'text', text: 'Sorry, the menu is empty.' };

    // Store menu in session for quick access later
    session.currentStep = 'placingOrder';
    session.temporaryData = { menu };
    await this.sessionsService.updateSession(session.deviceId, session);

    // Send menu as interactive cards
    const items = menu.map((item, idx) => ({
      id: (idx + 1).toString(),
      name: item.name,
      price: item.price,
      description: item.description || '',
    }));

    return {
      type: 'menuList',
      text: 'Here is our menu. Tap an item to select it.',
      items,
    };
  }

  private async handleItemSelection(input: string, session: Session) {
    const menu = session.temporaryData?.menu;
    if (!menu) return this.startPlacingOrder(session);

    const itemIndex = parseInt(input, 10) - 1;
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= menu.length) {
      return { type: 'text', text: 'Invalid item number. Please select from the menu.' };
    }

    const chosen = menu[itemIndex];
    session.temporaryData.pendingItem = {
      menuItemId: chosen._id,
      name: chosen.name,
      price: chosen.price,
    };
    session.currentStep = 'awaitingQuantity';
    await this.sessionsService.updateSession(session.deviceId, session);

    return {
      type: 'quantityInput',
      text: `How many ${chosen.name} would you like?`,
      itemName: chosen.name,
      // We'll provide quick quantity buttons on the frontend
    };
  }

  private async handleQuantityInput(input: string, session: Session) {
    const quantity = parseInt(input, 10);
    if (isNaN(quantity) || quantity < 1) {
      return { type: 'text', text: 'Please enter a valid quantity (1 or more).' };
    }

    const pending = session.temporaryData?.pendingItem;
    if (!pending) {
      session.currentStep = 'placingOrder';
      await this.sessionsService.updateSession(session.deviceId, session);
      return { type: 'text', text: 'Something went wrong. Please select an item again.' };
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

    // Return to menu with a success message
    const menu = await this.menuService.getAvailableMenu();
    console.log('🔎 BotService: fetched menu items count:', menu.length);
    const items = menu.map((item, idx) => ({
      id: (idx + 1).toString(),
      name: item.name,
      price: item.price,
      description: item.description || '',
    }));

    console.log('📤 BotService: returning menuList with items:', JSON.stringify(items));

    return {
      type: 'menuList',
      text: `✅ Added ${quantity}x ${pending.name} to your order.\n\nYou can select another item or use these options:`,
      items,
      // Also show quick action buttons below the menu
      buttons: [
        { id: '99', label: '🧾 Checkout' },
        { id: '97', label: '🛒 View Order' },
        { id: '0', label: '❌ Cancel' },
      ],
    };
  }

  private async checkout(session: Session) {
    const order = await this.ordersService.findCurrentOrder(session.deviceId, 'pending');
    if (!order || order.items.length === 0) {
      return { type: 'text', text: 'No order to place. Enter 1 to start a new order.' };
    }

    order.status = 'placed';
    await order.save();

    session.currentStep = 'checkout';
    await this.sessionsService.updateSession(session.deviceId, session);

    // Build a summary card
    const items = order.items.map(i => ({
      name: (i.menuItem as any)?.name || 'Unknown Item',
      quantity: i.quantity,
      price: i.priceAtOrder,
    }));
    const totalNaira = (order.total / 100).toFixed(2);

    return {
      type: 'checkout',
      text: 'Please confirm your order and pay.',
      orderSummary: {
        items,
        total: totalNaira,
        orderId: order._id.toString(),
      },
      // The gateway will attach paymentRequired separately
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

    return {
      type: 'mainMenu',
      text: '❌ Order cancelled.',
      buttons: [
        { id: '1', label: '🍔 Place a New Order' },
        { id: '98', label: '📜 Order History' },
        { id: '97', label: '🛒 Current Order' },
      ],
    };
  }

  private async orderHistory(session: Session) {
    const orders = await this.ordersService.getOrderHistory(session.deviceId);
    if (orders.length === 0) return { type: 'text', text: 'No order history found.' };

    const historyItems = orders.map(o => ({
      id: o._id.toString().slice(-4),
      items: o.items.map(i => `${i.quantity}x ${(i.menuItem as any)?.name || 'Unknown'}`).join(', '),
      total: `₦${(o.total / 100).toFixed(2)}`,
      status: o.status,
      date: o.createdAt?.toLocaleDateString() ?? 'N/A',
    }));

    return {
      type: 'orderHistory',
      text: 'Your past orders:',
      orders: historyItems,
      buttons: [
        { id: '1', label: '🍔 New Order' },
        { id: '97', label: '🛒 Current Order' },
      ],
    };
  }

  private async currentOrderStatus(session: Session) {
    let order = await this.ordersService.findCurrentOrder(session.deviceId, 'pending');
    if (!order) {
      order = await this.ordersService.findCurrentOrder(session.deviceId, 'placed');
    }

    if (!order || order.items.length === 0) {
       return {
        type: 'mainMenu',
        text: 'No order to place. Choose an option:',
        buttons: [
          { id: '1', label: '🍔 Place an Order' },
          { id: '99', label: '🧾 Checkout' },
          { id: '98', label: '📜 Order History' },
          { id: '97', label: '🛒 Current Order' },
          { id: '0', label: '❌ Cancel Order' },
        ],
      };
    }

    // Mark as placed if not already
    if (order.status !== 'placed') {
      order.status = 'placed';
      await order.save();
    }

    session.currentStep = 'checkout';
    await this.sessionsService.updateSession(session.deviceId, session);

    const items = order.items.map(i => ({
      name: (i.menuItem as any)?.name || 'Unknown',
      quantity: i.quantity,
      price: i.priceAtOrder,
    }));
    const totalNaira = (order.total / 100).toFixed(2);

    return {
      type: 'checkout',
      text: 'Please confirm your order and pay.',
      orderSummary: { 
        items, 
        total: totalNaira,
        orderId: order._id.toString(),
      },
      buttons: [
        { id: '99', label: '🧾 Checkout' },
        { id: '1', label: '➕ Add More Items' },
        { id: '0', label: '❌ Cancel Order' },
      ],
    };
  }
}