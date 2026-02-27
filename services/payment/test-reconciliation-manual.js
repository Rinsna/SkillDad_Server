/**
 * Manual Test Script for ReconciliationService
 * 
 * This script demonstrates the usage of ReconciliationService with mock data.
 * Run with: node server/services/payment/test-reconciliation-manual.js
 * 
 * Note: This is a demonstration script. For production use, ensure:
 * 1. MongoDB is connected
 * 2. HDFC Gateway credentials are configured
 * 3. Required npm packages are installed: npm install json2csv exceljs
 */

const ReconciliationService = require('./ReconciliationService');

// Mock HDFCGatewayService for testing
class MockHDFCGatewayService {
  constructor() {
    this.merchantId = 'TEST_MERCHANT';
    this.apiKey = 'test_api_key';
    this.apiSecret = 'test_api_secret';
    this.gatewayUrl = 'https://test.gateway.com';
    
    // Mock signature service
    this.signatureService = {
      generateSignature: (data, secret) => {
        return 'mock_signature_' + Date.now();
      }
    };
  }
}

// Mock fetch for testing
global.fetch = async (url, options) => {
  console.log(`Mock fetch called: ${url}`);
  
  // Mock settlement report response
  if (url.includes('settlement-report')) {
    return {
      ok: true,
      headers: {
        get: (header) => {
          if (header === 'content-type') {
            return 'application/json';
          }
          return null;
        }
      },
      json: async () => ({
        transactions: [
          {
            transaction_id: 'TXN_1234567890',
            gateway_transaction_id: 'HDFC_987654321',
            amount: 10000.00,
            status: 'success',
            settlement_date: '2024-01-15',
            payment_method: 'credit_card',
            gateway_fee: 200.00,
            net_amount: 9800.00
          },
          {
            transaction_id: 'TXN_1234567891',
            gateway_transaction_id: 'HDFC_987654322',
            amount: 5000.00,
            status: 'success',
            settlement_date: '2024-01-15',
            payment_method: 'upi',
            gateway_fee: 50.00,
            net_amount: 4950.00
          }
        ]
      })
    };
  }
  
  throw new Error('Unexpected fetch URL');
};

async function testReconciliationService() {
  console.log('=== ReconciliationService Manual Test ===\n');
  
  try {
    // Initialize service with mock gateway
    const mockGateway = new MockHDFCGatewayService();
    const reconciliationService = new ReconciliationService(mockGateway);
    
    console.log('✓ ReconciliationService initialized successfully\n');
    
    // Test 1: Fetch Settlement Report
    console.log('Test 1: Fetching settlement report...');
    const settlementDate = new Date('2024-01-15');
    const settlementRecords = await reconciliationService.fetchSettlementReport(settlementDate);
    
    console.log(`✓ Fetched ${settlementRecords.length} settlement records`);
    console.log('Settlement Records:');
    settlementRecords.forEach(record => {
      console.log(`  - ${record.transactionId}: ₹${record.amount} (${record.status})`);
    });
    console.log();
    
    // Test 2: Parse JSON Settlement Data
    console.log('Test 2: Parsing JSON settlement data...');
    const mockJsonData = {
      transactions: [
        {
          transaction_id: 'TXN_TEST_001',
          amount: 1000.50,
          status: 'success',
          settlement_date: '2024-01-15',
          payment_method: 'debit_card'
        }
      ]
    };
    
    const parsedJson = reconciliationService.parseSettlementJSON(mockJsonData);
    console.log(`✓ Parsed ${parsedJson.length} records from JSON`);
    console.log('Parsed Record:', parsedJson[0]);
    console.log();
    
    // Test 3: Parse CSV Settlement Data
    console.log('Test 3: Parsing CSV settlement data...');
    const mockCsvData = `transaction_id,amount,status,settlement_date,payment_method
TXN_TEST_002,2000.75,success,2024-01-15,net_banking
TXN_TEST_003,3000.00,success,2024-01-15,upi`;
    
    const parsedCsv = reconciliationService.parseSettlementCSV(mockCsvData);
    console.log(`✓ Parsed ${parsedCsv.length} records from CSV`);
    parsedCsv.forEach(record => {
      console.log(`  - ${record.transactionId}: ₹${record.amount}`);
    });
    console.log();
    
    // Test 4: Status Normalization
    console.log('Test 4: Testing status normalization...');
    const testStatuses = ['success', 'completed', 'settled', 'refunded', 'failed'];
    testStatuses.forEach(status => {
      const normalized = reconciliationService.normalizeStatus(status);
      console.log(`  ${status} → ${normalized}`);
    });
    console.log();
    
    console.log('=== All Tests Passed ===\n');
    
    console.log('Note: To test full reconciliation functionality:');
    console.log('1. Ensure MongoDB is connected');
    console.log('2. Create test transactions in the database');
    console.log('3. Configure HDFC Gateway credentials');
    console.log('4. Install required packages: npm install json2csv exceljs');
    console.log('5. Use the reconcileTransactions() and generateReconciliationReport() methods');
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testReconciliationService()
  .then(() => {
    console.log('\nTest completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nTest failed:', error);
    process.exit(1);
  });
