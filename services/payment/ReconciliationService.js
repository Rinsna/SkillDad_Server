const { query } = require('../../config/postgres');
const HDFCGatewayService = require('./HDFCGatewayService');

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
    let reconciliationId;
    try {
      // Create reconciliation record in PostgreSQL
      const recRes = await query(`
        INSERT INTO reconciliations (
          start_date, 
          end_date, 
          performed_by, 
          status
        ) VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [startDate, endDate, userId, 'in_progress']);

      reconciliationId = recRes.rows[0].id;

      try {
        // 1. Fetch local transactions for date range from PostgreSQL
        const localTxnsRes = await query(`
          SELECT transaction_id, status, final_amount, initiated_at
          FROM transactions
          WHERE initiated_at >= $1 AND initiated_at <= $2
        `, [startDate, endDate]);

        const localTransactions = localTxnsRes.rows;

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
          const sysAmount = parseFloat(txn.final_amount);
          totalSystemAmount += sysAmount;

          const gatewayRec = settlementMap.get(txn.transaction_id);

          if (!gatewayRec) {
            // Missing in gateway (if it was successful in our system)
            if (txn.status === 'success') {
              discrepancies.push({
                transactionId: txn.transaction_id,
                type: 'missing_in_gateway',
                systemAmount: txn.final_amount,
                systemStatus: txn.status,
                description: `Transaction ${txn.transaction_id} marked as success in system but missing in gateway report.`
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
                transactionId: txn.transaction_id,
                type: 'amount_mismatch',
                systemAmount: txn.final_amount,
                gatewayAmount: gtwAmount,
                description: `Amount mismatch: System ₹${sysAmount.toFixed(2)}, Gateway ₹${gtwAmount.toFixed(2)}`
              });
            } else if (txn.status !== gtwStatus) {
              // Status mismatch
              discrepancies.push({
                transactionId: txn.transaction_id,
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
            settlementMap.delete(txn.transaction_id);
          }
        });

        // 4. Check for transactions only in gateway
        settlementMap.forEach((rec, txnId) => {
          discrepancies.push({
            transactionId: txnId,
            type: 'missing_in_system',
            gatewayAmount: parseFloat(rec.amount),
            gatewayStatus: this.normalizeStatus(rec.status),
            description: `Transaction ${txnId} found in gateway report but missing in SkillDad database.`
          });
        });

        // 5. Finalize reconciliation record
        const finalStatus = discrepancies.length > 0 ? 'resolved' : 'completed';

        const finalRes = await query(`
          UPDATE reconciliations
          SET total_transactions = $1,
              matched_transactions = $2,
              unmatched_transactions = $3,
              total_amount = $4,
              settled_amount = $5,
              refunded_amount = $6,
              net_settlement_amount = $7,
              discrepancies = $8,
              status = $9,
              completed_at = $10,
              updated_at = $10
          WHERE id = $11
          RETURNING *
        `, [
          localTransactions.length,
          matchedCount,
          discrepancies.length,
          totalSystemAmount,
          settledAmount,
          refundedAmount,
          (settledAmount - refundedAmount),
          JSON.stringify(discrepancies),
          finalStatus,
          new Date(),
          reconciliationId
        ]);

        return finalRes.rows[0];
      } catch (error) {
        await query(`
          UPDATE reconciliations
          SET status = 'failed',
              error_message = $1,
              updated_at = $2
          WHERE id = $3
        `, [error.message, new Date(), reconciliationId]);
        throw error;
      }
    } catch (error) {
      throw new Error(`Failed to reconcile transactions: ${error.message}`);
    }
  }

  /**
   * Get reconciliation report by ID
   * @param {string|number} id - Reconciliation ID
   * @returns {Promise<Object>} Reconciliation report
   */
  async getReconciliationReport(id) {
    try {
      const res = await query(`
        SELECT r.*, u.name as performed_by_name, u.email as performed_by_email
        FROM reconciliations r
        LEFT JOIN users u ON r.performed_by = u.id
        WHERE r.id = $1
      `, [id]);

      if (res.rows.length === 0) return null;
      return res.rows[0];
    } catch (error) {
      throw new Error(`Failed to get reconciliation report: ${error.message}`);
    }
  }

  /**
   * List reconciliation reports with pagination
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Paginated reports
   */
  async listReconciliations(page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;

      const res = await query(`
        SELECT r.*, u.name as performed_by_name, u.email as performed_by_email
        FROM reconciliations r
        LEFT JOIN users u ON r.performed_by = u.id
        ORDER BY r.start_date DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const countRes = await query(`SELECT COUNT(*) as count FROM reconciliations`);

      return {
        reconciliations: res.rows,
        total: parseInt(countRes.rows[0].count)
      };
    } catch (error) {
      throw new Error(`Failed to list reconciliations: ${error.message}`);
    }
  }

  /**
   * Resolve a discrepancy
   * @param {string|number} reconciliationId - Reconciliation ID
   * @param {string} transactionId - Transaction ID
   * @param {string} notes - Resolution notes
   * @param {string} userId - User ID resolving the discrepancy
   */
  async resolveDiscrepancy(reconciliationId, transactionId, notes, userId) {
    try {
      // Fetch reconciliation
      const reconciliation = await this.getReconciliationReport(reconciliationId);
      if (!reconciliation) throw new Error('Reconciliation not found');

      const discrepancies = reconciliation.discrepancies || [];
      const index = discrepancies.findIndex(d => d.transactionId === transactionId);

      if (index === -1) throw new Error('Discrepancy not found');
      if (discrepancies[index].resolved) throw new Error('Discrepancy already resolved');

      // Update discrepancy
      discrepancies[index].resolved = true;
      discrepancies[index].resolvedAt = new Date();
      discrepancies[index].resolvedBy = userId;
      discrepancies[index].notes = notes;

      // Save back to PostgreSQL
      await query(`
        UPDATE reconciliations
        SET discrepancies = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(discrepancies), reconciliationId]);

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to resolve discrepancy: ${error.message}`);
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
    const filename = `reconciliation_report_${new Date(startDate).toISOString().split('T')[0]}_${new Date(endDate).toISOString().split('T')[0]}.${format}`;
    return `/reports/${filename}`;
  }
}

module.exports = ReconciliationService;

