const Transaction = require('../../models/payment/Transaction');
const Reconciliation = require('../../models/payment/Reconciliation');
const HDFCGatewayService = require('./HDFCGatewayService');
const mongoose = require('mongoose');

/**
 * ReconciliationService - Handles reconciliation between SkillDad and Payment Gateway
 * 
 * Requirements: 10.1-10.8
 */
class ReconciliationService {
  /**
   * Initialize Reconciliation Service
   * @param {Object} gatewayService - Gateway service instance (optional)
   */
  constructor(gatewayService = null) {
    this.gatewayService = gatewayService || new HDFCGatewayService();
  }

  /**
   * Normalize status from different gateways to system status
   * @param {string} status - Gateway status
   * @returns {string} System status
   */
  normalizeStatus(status) {
    if (!status) return 'unknown';
    const s = status.toLowerCase();
    if (s === 'success' || s === 'completed' || s === 'settled') return 'success';
    if (s === 'failed' || s === 'declined' || s === 'rejected') return 'failed';
    if (s === 'refunded' || s === 'reversed') return 'refunded';
    if (s === 'pending' || s === 'processing') return 'pending';
    return s;
  }

  /**
   * Reconcile transactions between local database and gateway settlement
   * @param {Date} startDate - Start of range
   * @param {Date} endDate - End of range
   * @param {string} userId - User performing reconciliation
   */
  async reconcileTransactions(startDate, endDate, userId) {
    try {
      // Create reconciliation record
      const reconciliation = new Reconciliation({
        reconciliationDate: new Date(),
        startDate,
        endDate,
        performedBy: userId,
        status: 'in_progress',
      });

      await reconciliation.save();

      try {
        // 1. Fetch local transactions for date range
        const localTransactions = await Transaction.find({
          initiatedAt: {
            $gte: startDate,
            $lte: endDate,
          }
        }).lean();

        // 2. Fetch settlement reports from gateway
        const settlementRecords = await this.gatewayService.fetchSettlementReport(startDate, endDate);

        // Create a map for quick lookup
        const settlementMap = new Map();
        settlementRecords.forEach(rec => {
          settlementMap.set(rec.transactionId || rec.orderId, rec);
        });

        // 3. Process matches and discrepancies
        const discrepancies = [];
        let matchedCount = 0;
        let totalSystemAmount = 0;
        let totalGatewayAmount = 0;
        let refundedAmount = 0;
        let settledAmount = 0;

        // Check local transactions against gateway
        localTransactions.forEach(txn => {
          const sysAmount = parseFloat(txn.finalAmount.toString());
          totalSystemAmount += sysAmount;

          const gatewayRec = settlementMap.get(txn.transactionId);

          if (!gatewayRec) {
            // Missing in gateway (if it was successful in our system)
            if (txn.status === 'success') {
              discrepancies.push({
                transactionId: txn.transactionId,
                type: 'missing_in_gateway',
                systemAmount: txn.finalAmount,
                systemStatus: txn.status,
                description: `Transaction ${txn.transactionId} marked as success in system but missing in gateway report.`
              });
            }
          } else {
            const gtwAmount = parseFloat(gatewayRec.amount);
            const gtwStatus = this.normalizeStatus(gatewayRec.status);

            totalGatewayAmount += gtwAmount;

            // Check for amount mismatch (allow 0.01 tolerance)
            const amountDiff = Math.abs(sysAmount - gtwAmount);
            if (amountDiff > 0.01) {
              discrepancies.push({
                transactionId: txn.transactionId,
                type: 'amount_mismatch',
                systemAmount: txn.finalAmount,
                gatewayAmount: mongoose.Types.Decimal128.fromString(gtwAmount.toFixed(2)),
                description: `Amount mismatch: System ₹${sysAmount.toFixed(2)}, Gateway ₹${gtwAmount.toFixed(2)}`
              });
            } else if (txn.status !== gtwStatus) {
              // Status mismatch
              discrepancies.push({
                transactionId: txn.transactionId,
                type: 'status_mismatch',
                systemStatus: txn.status,
                gatewayStatus: gtwStatus,
                description: `Status mismatch: System ${txn.status}, Gateway ${gtwStatus}`
              });
            } else {
              // Perfect match
              matchedCount++;
              if (gtwStatus === 'success') settledAmount += gtwAmount;
              if (gtwStatus === 'refunded') refundedAmount += gtwAmount;
            }

            // Remove from map to track "gateway only" transactions
            settlementMap.delete(txn.transactionId);
          }
        });

        // 4. Check for transactions only in gateway
        settlementMap.forEach((rec, txnId) => {
          discrepancies.push({
            transactionId: txnId,
            type: 'missing_in_system',
            gatewayAmount: mongoose.Types.Decimal128.fromString(parseFloat(rec.amount).toFixed(2)),
            gatewayStatus: this.normalizeStatus(rec.status),
            description: `Transaction ${txnId} found in gateway report but missing in SkillDad database.`
          });
        });

        // 5. Finalize reconciliation record
        reconciliation.totalTransactions = localTransactions.length;
        reconciliation.matchedTransactions = matchedCount;
        reconciliation.unmatchedTransactions = discrepancies.length;
        reconciliation.totalAmount = mongoose.Types.Decimal128.fromString(totalSystemAmount.toFixed(2));
        reconciliation.settledAmount = mongoose.Types.Decimal128.fromString(settledAmount.toFixed(2));
        reconciliation.refundedAmount = mongoose.Types.Decimal128.fromString(refundedAmount.toFixed(2));
        reconciliation.netSettlementAmount = mongoose.Types.Decimal128.fromString((settledAmount - refundedAmount).toFixed(2));
        reconciliation.discrepancies = discrepancies;
        reconciliation.status = discrepancies.length > 0 ? 'resolved' : 'completed'; // 'resolved' here means 'has discrepancies that may need resolution'
        reconciliation.completedAt = new Date();

        await reconciliation.save();

        return reconciliation;
      } catch (error) {
        reconciliation.status = 'failed';
        reconciliation.errorMessage = error.message;
        await reconciliation.save();
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to reconcile transactions: ${error.message}`);
    }
  }

  /**
   * Generate reconciliation report
   * @param {Date} startDate - Start of range
   * @param {Date} endDate - End of range
   * @param {string} format - Report format (csv/excel)
   */
  async generateReconciliationReport(startDate, endDate, format = 'csv') {
    // Placeholder: In real implementation, use exceljs or similar to generate file and upload to S3/CDN
    const filename = `reconciliation_report_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.${format}`;
    return `/reports/${filename}`;
  }
}

module.exports = ReconciliationService;

