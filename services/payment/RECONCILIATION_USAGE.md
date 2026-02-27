# ReconciliationService Usage Guide

## Overview

The `ReconciliationService` handles reconciliation between SkillDad transaction records and payment gateway reports. It identifies discrepancies, generates reports, and maintains audit trails for financial reconciliation.

## Requirements

Before using the ReconciliationService, install the required npm packages:

```bash
npm install json2csv exceljs
```

## Initialization

```javascript
const { ReconciliationService } = require('./services/payment');

// Initialize Reconciliation Service
const reconciliationService = new ReconciliationService();
```

## Methods

### 1. reconcileTransactions(startDate, endDate, userId)

Reconciles transactions between local database and gateway records for a date range.

**Parameters:**
- `startDate` (Date): Start date of reconciliation period
- `endDate` (Date): End date of reconciliation period
- `userId` (string): ID of user performing reconciliation

**Returns:** Promise<Object> - Reconciliation record with summary

**Example:**
```javascript
const startDate = new Date('2024-01-01');
const endDate = new Date('2024-01-31');
const userId = '507f1f77bcf86cd799439011'; // Finance team member ID

const reconciliation = await reconciliationService.reconcileTransactions(
  startDate,
  endDate,
  userId
);

console.log('Reconciliation Summary:');
console.log(`Total Transactions: ${reconciliation.totalTransactions}`);
console.log(`Matched: ${reconciliation.matchedTransactions}`);
console.log(`Total Amount: ${reconciliation.totalAmountFormatted}`);
```

### 2. generateReconciliationReport(startDate, endDate, format)

Generates reconciliation report in CSV or Excel format.

**Parameters:**
- `startDate` (Date): Start date of report period
- `endDate` (Date): End date of report period
- `format` (string): Report format ('csv' or 'excel'), default: 'excel'

**Returns:** Promise<Object> - Report data summary

## Error Handling

All methods throw errors with descriptive messages. Always wrap calls in try-catch blocks:

```javascript
try {
  const reconciliation = await reconciliationService.reconcileTransactions(
    startDate,
    endDate,
    userId
  );
  // Process reconciliation
} catch (error) {
  console.error('Reconciliation error:', error.message);
}
```
