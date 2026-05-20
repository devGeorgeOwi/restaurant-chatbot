export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/restaurant_chat',
  paystackSecret: process.env.PAYSTACK_SECRET_KEY,
  paystackPublic: process.env.PAYSTACK_PUBLIC_KEY,
});