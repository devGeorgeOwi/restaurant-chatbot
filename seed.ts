import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { MenuService } from './src/menu/menu.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const menuService = app.get(MenuService);
  const items = [
    { name: 'Jollof Rice & Chicken', price: 250000, description: 'Classic party Jollof', available: true },
    { name: 'Pounded Yam & Egusi', price: 300000, description: 'Smooth pounded yam', available: true },
    { name: 'Shawarma Wrap', price: 150000, description: 'Beef shawarma', available: true },
    { name: 'Smoothie Bowl', price: 120000, description: 'Açaí bowl', available: true },
    { name: 'Bottled Water', price: 30000, description: 'Chilled 75cl', available: true },
  ];
  const MenuModel = (menuService as any).menuModel;
  await MenuModel.deleteMany({});
  await MenuModel.insertMany(items);
  console.log('Menu seeded');
  await app.close();
}
bootstrap();