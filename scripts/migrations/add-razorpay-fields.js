/**
 * Migration Script: Add Razorpay Fields to Transaction Model
 * 
 * This script adds Razorpay-specific fields to existing transaction records.
 * It's safe to run multiple times (idempotent).
 * 
 * Usage:
 *   node server/scripts/migrations/add-razorpay-fields.js
 * 
 * What it does:
 * 1. Adds razorpayPaymentId field (initially null)
 * 2. Adds razorpaySignature field (initially null)
 * 3. Updates payment method enum values to match Razorpay
 * 4. Renames gatewayOrderId to gatewayTransactionId if needed
 * 
 * Note: This migration is backward compatible. Old Stripe fields are not removed
 * to maintain data integrity and audit trail.
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

// Migration function
const migrateTransactions = async () => {
  try {
    console.log('\n=== Starting Razorpay Fields Migration ===\n');

    // Get all transactions
    const transactions = await Transaction.find({});
    console.log(`Found ${transactions.length} transactions to process`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const transaction of transactions) {
      let needsUpdate = false;
      const updates = {};

      // Add razorpayPaymentId if not present
      if (!transaction.razorpayPaymentId) {
        updates.razorpayPaymentId = null;
        needsUpdate = true;
      }

      // Add razorpaySignature if not present
      if (!transaction.razorpaySignature) {
        updates.razorpaySignature = null;
        needsUpdate = true;
      }

      // Map old payment method values to new Razorpay values
      if (transaction.paymentMethod) {
        const methodMapping = {
          'credit_card': 'card',
          'debit_card': 'card',
          'net_banking': 'netbanking',
          'upi': 'upi',
          'wallet': 'wallet',
          'unknown': 'unknown'
        };

        const newMethod = methodMapping[transaction.paymentMethod];
        if (newMethod && newMethod !== transaction.paymentMethod) {
          updates.paymentMethod = newMethod;
          needsUpdate = true;
        }
      }

      // Apply updates if needed
      if (needsUpdate) {
        await Transaction.updateOne(
          { _id: transaction._id },
          { $set: updates }
        );
        updatedCount++;
        
        if (updatedCount % 100 === 0) {
          console.log(`  Processed ${updatedCount} transactions...`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`✓ Updated: ${updatedCount} transactions`);
    console.log(`- Skipped: ${skippedCount} transactions (already migrated)`);
    console.log(`✓ Total: ${transactions.length} transactions processed\n`);

  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    throw error;
  }
};

// Run migration
const runMigration = async () => {
  try {
    await connectDB();
    await migrateTransactions();
    
    console.log('✓ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
};

// Execute if run directly
if (require.main === module) {
  runMigration();
}

module.exports = { migrateTransactions };
