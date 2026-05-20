import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { BotService } from './bot.service';
import { SessionsModule } from '../sessions/sessions.module';
import { OrdersModule } from '../orders/orders.module';
import { MenuModule } from '../menu/menu.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [SessionsModule, OrdersModule, MenuModule, PaymentModule],
  providers: [ChatGateway, BotService],
})
export class ChatModule {}