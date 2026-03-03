/**
 * Rollback Script: Remove Razorpay Fields from Transaction Model
 * 
 * This script removes Razorpay-specific fields from transaction records.
 * Use this only if you need to rollback the migration.
 * 
 * Usage:
 *   node server/scripts/migrations/rollback-razorpay-fields.js
 * 
 * WARNING: This will remove Razorpay payment data. Use with caution!
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../../models/payment/Transaction');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✓ MongoDB connected');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Rollback function
const rollbackTransactions = async () => {
  try {
    console.log('\n=== Starting Razorpay Fields Rollback ===\n');
    console.log('⚠️  WARNING: This will remove Razorpay payment data!');
    console.log('⚠️  Press Ctrl+C within 5 seconds to cancel...\n');

    // Wait 5 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Remove Razorpay fields
    const result = await Transaction.updateMany(
      {},
      {
        $unset: {
          razorpayPaymentId: '',
          razorpaySignature: ''
        }
      }
    );

    console.log('\n=== Rollback Complete ===');
    console.log(`✓ Modified: ${result.modifiedCount} transactions`);
    console.log(`✓ Matched: ${result.matchedCount} transactions\n`);

  } catch (error) {
    console.error('\n✗ Rollback failed:', error);
    throw error;
  }
};

// Run rollback
const runRollback = async () => {
  try {
    await connectDB();
    await rollbackTransactions();
    
    console.log('✓ Rollback completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Rollback failed:', error);
    process.exit(1);
  }
};

// Execute if run directly
if (require.main === module) {
  runRollback();
}

module.exports = { rollbackTransactions };
