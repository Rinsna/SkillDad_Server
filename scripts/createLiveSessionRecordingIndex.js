/**
 * Migration Script: Create Compound Index for Zoom Recording Queries
 * 
 * Purpose: Create a compound index on LiveSession collection to optimize
 * queries for available Zoom recordings. This index supports the query pattern:
 * - Filter by status='ended'
 * - Filter by recording.status='completed'
 * - Sort by endTime descending
 * 
 * The compound index { status: 1, 'recording.status': 1, endTime: -1 } enables
 * MongoDB to efficiently execute this query without scanning all documents.
 * 
 * Performance Target: Query time < 50ms for 1000+ sessions
 * 
 * Actions:
 * 1. Connects to MongoDB
 * 2. Creates compound index with background option (safe for production)
 * 3. Verifies index creation
 * 4. Reports index statistics
 * 
 * Usage:
 *   node server/scripts/createLiveSessionRecordingIndex.js [--drop-first]
 * 
 * Options:
 *   --drop-first  Drop the index if it exists before creating (use with caution)
 * 
 * Requirements: 2.7, 11.1, 11.6
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const LiveSession = require('../models/liveSessionModel');

// Parse command line arguments
const args = process.argv.slice(2);
const dropFirst = args.includes('--drop-first');

/**
 * Main index creation function
 */
async function createRecordingIndex() {
    console.log('='.repeat(70));
    console.log('LiveSession Recording Index Creation Script');
    console.log('='.repeat(70));
    console.log(`Drop existing index first: ${dropFirst ? 'YES' : 'NO'}`);
    console.log('='.repeat(70));
    console.log('');

    try {
        // Connect to database
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to database\n');

        // Get the collection
        const collection = mongoose.connection.collection('livesessions');

        // Index name and specification
        const indexName = 'status_1_recording.status_1_endTime_-1';
        const indexSpec = {
            status: 1,
            'recording.status': 1,
            endTime: -1
        };
        const indexOptions = {
            name: indexName,
            background: true  // Safe for production - doesn't block other operations
        };

        // Step 1: Check if index already exists
        console.log('Step 1: Checking for existing indexes...');
        const existingIndexes = await collection.indexes();
        const indexExists = existingIndexes.some(idx => idx.name === indexName);

        if (indexExists) {
            console.log(`✓ Index "${indexName}" already exists`);
            
            if (dropFirst) {
                console.log(`\nStep 2: Dropping existing index...`);
                await collection.dropIndex(indexName);
                console.log(`✓ Index "${indexName}" dropped successfully\n`);
            } else {
                console.log('\nℹ Index already exists. Use --drop-first to recreate it.\n');
                
                // Show index details
                const indexInfo = existingIndexes.find(idx => idx.name === indexName);
                console.log('Existing index details:');
                console.log(JSON.stringify(indexInfo, null, 2));
                console.log('');
                
                await mongoose.connection.close();
                console.log('✓ Database connection closed');
                process.exit(0);
            }
        } else {
            console.log(`ℹ Index "${indexName}" does not exist yet\n`);
        }

        // Step 2: Create the compound index
        console.log(`Step ${dropFirst ? '3' : '2'}: Creating compound index...`);
        console.log('Index specification:');
        console.log(`  { status: 1, 'recording.status': 1, endTime: -1 }`);
        console.log('Options:');
        console.log(`  { background: true }`);
        console.log('');

        const startTime = Date.now();
        await collection.createIndex(indexSpec, indexOptions);
        const duration = Date.now() - startTime;

        console.log(`✓ Index created successfully in ${duration}ms\n`);

        // Step 3: Verify index creation
        console.log(`Step ${dropFirst ? '4' : '3'}: Verifying index creation...`);
        const updatedIndexes = await collection.indexes();
        const newIndex = updatedIndexes.find(idx => idx.name === indexName);

        if (newIndex) {
            console.log('✓ Index verified successfully');
            console.log('\nIndex details:');
            console.log(JSON.stringify(newIndex, null, 2));
            console.log('');
        } else {
            throw new Error('Index verification failed - index not found after creation');
        }

        // Step 4: Get collection statistics
        console.log(`Step ${dropFirst ? '5' : '4'}: Gathering collection statistics...`);
        const docCount = await collection.countDocuments();
        const indexInfo = await collection.indexInformation();
        console.log(`Total documents: ${docCount.toLocaleString()}`);
        console.log(`Total indexes: ${Object.keys(indexInfo).length}`);
        console.log('');

        // Step 5: Test query performance (if there are documents)
        if (docCount > 0) {
            console.log(`Step ${dropFirst ? '6' : '5'}: Testing query performance...`);
            
            const queryStartTime = Date.now();
            const testQuery = await LiveSession.find({
                status: 'ended',
                'recording.status': 'completed'
            })
            .sort({ endTime: -1 })
            .limit(50)
            .explain('executionStats');
            
            const queryDuration = Date.now() - queryStartTime;
            
            console.log(`Query execution time: ${queryDuration}ms`);
            console.log(`Documents examined: ${testQuery.executionStats.totalDocsExamined}`);
            console.log(`Documents returned: ${testQuery.executionStats.nReturned}`);
            console.log(`Index used: ${testQuery.executionStats.executionStages.indexName || 'COLLSCAN'}`);
            
            if (queryDuration < 50) {
                console.log('✓ Query performance meets target (< 50ms)');
            } else if (queryDuration < 200) {
                console.log('⚠ Query performance acceptable but above target (< 200ms)');
            } else {
                console.log('✗ Query performance below target - may need optimization');
            }
            console.log('');
        }

        // Summary
        console.log('='.repeat(70));
        console.log('Index Creation Summary');
        console.log('='.repeat(70));
        console.log('✓ Compound index created successfully');
        console.log(`✓ Index name: ${indexName}`);
        console.log(`✓ Index specification: { status: 1, 'recording.status': 1, endTime: -1 }`);
        console.log('✓ Background option enabled (production-safe)');
        console.log('');
        console.log('This index optimizes queries for available Zoom recordings:');
        console.log('  - Filter by status="ended"');
        console.log('  - Filter by recording.status="completed"');
        console.log('  - Sort by endTime descending');
        console.log('');
        console.log('Expected performance: < 50ms for 1000+ sessions');
        console.log('');

        // Close database connection
        await mongoose.connection.close();
        console.log('✓ Database connection closed');
        
        process.exit(0);

    } catch (error) {
        console.error('\n✗ Fatal error during index creation:', error);
        
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
        
        process.exit(1);
    }
}

// Run the script
createRecordingIndex();
