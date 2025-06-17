import cron from 'node-cron';
import OrderModel from '../models/OrderSchema.js';

// ⏱ Run every 1 minute
cron.schedule('* * * * *', async () => {
  console.log('⏰ Running scheduled order cleanup...');

  const now = new Date();

  try {
    // ❌ Cancel orders > 5 mins old with no bill.generatedAt
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
    await OrderModel.updateMany(
      {
        status: 'Pending',
        $or: [
          { 'bill.generatedAt': { $exists: false } },
          { 'bill.generatedAt': null }
        ],
        createdAt: { $lte: fiveMinsAgo }
      },
      { $set: { status: 'Cancelled' } }
    );

    // ❌ Cancel orders if bill is not paid after 45 mins
    const fortyFiveMinsAgo = new Date(now.getTime() - 45 * 60 * 1000);
    await OrderModel.updateMany(
      {
        status: 'Accepted',
        'bill.status': 'Pending',
        'bill.generatedAt': { $lte: fortyFiveMinsAgo }
      },
      { $set: { status: 'Cancelled' } }
    );

    console.log('✅ Order cleanup complete');
  } catch (error) {
    console.error('❌ Error in scheduled job:', error);
  }
});
