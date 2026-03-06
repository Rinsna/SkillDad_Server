const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

const findDatabase = async () => {
    try {
        console.log('='.repeat(60));
        console.log('DATABASE DIAGNOSTIC TOOL');
        console.log('='.repeat(60));
        console.log('');

        // Check for custom data directory in workspace
        const workspaceDataDir = path.join(__dirname, '../../.mongodb_data');
        console.log('0. Checking for custom MongoDB data directory...');
        if (fs.existsSync(workspaceDataDir)) {
            const files = fs.readdirSync(workspaceDataDir);
            const wtFiles = files.filter(f => f.endsWith('.wt'));
            console.log('   ✅ Found .mongodb_data directory in workspace!');
            console.log(`   📁 Location: ${workspaceDataDir}`);
            console.log(`   📊 Contains ${files.length} files (${wtFiles.length} data files)`);
            console.log('');
            console.log('   ⚠️  IMPORTANT: To use this data, MongoDB must be started with:');
            console.log('   mongod --dbpath=".mongodb_data" --port 27017');
            console.log('');
            console.log('   Or use the provided batch script: start_mongodb_with_data.bat');
            console.log('');
        } else {
            console.log('   No custom data directory found in workspace');
            console.log('');
        }

        // Check .env configuration
        console.log('1. Checking .env configuration...');
        console.log('   MONGO_URI:', process.env.MONGO_URI || 'NOT SET');
        console.log('');

        if (!process.env.MONGO_URI) {
            console.log('❌ ERROR: MONGO_URI is not set in .env file');
            console.log('');
            console.log('SOLUTION:');
            console.log('1. Copy .env.example to .env');
            console.log('2. Set MONGO_URI=mongodb://127.0.0.1:27017/skilldad');
            console.log('3. Run this script again');
            process.exit(1);
        }

        // Try to connect
        console.log('2. Attempting to connect to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected successfully!');
        console.log('');

        // Get database name from connection
        const dbName = mongoose.connection.db.databaseName;
        console.log('3. Current database:', dbName);
        console.log('');

        // List all databases
        console.log('4. Listing all databases on this MongoDB instance...');
        const admin = mongoose.connection.db.admin();
        const { databases } = await admin.listDatabases();
        
        console.log('');
        console.log('Available databases:');
        console.log('-'.repeat(60));
        databases.forEach(db => {
            const isCurrent = db.name === dbName;
            const marker = isCurrent ? '👉 (CURRENT)' : '  ';
            console.log(`${marker} ${db.name.padEnd(30)} Size: ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB`);
        });
        console.log('');

        // Check collections in current database
        console.log('5. Collections in current database (' + dbName + '):');
        console.log('-'.repeat(60));
        const collections = await mongoose.connection.db.listCollections().toArray();
        
        if (collections.length === 0) {
            console.log('⚠️  No collections found in this database!');
            console.log('');
            console.log('This might mean:');
            console.log('- You\'re connected to a new/empty database');
            console.log('- Your data is in a different database');
            console.log('');
        } else {
            for (const collection of collections) {
                const count = await mongoose.connection.db.collection(collection.name).countDocuments();
                console.log(`   ${collection.name.padEnd(30)} Documents: ${count}`);
            }
        }
        console.log('');

        // Check for user data specifically
        console.log('6. Checking for user data...');
        const User = require('../models/userModel');
        const userCount = await User.countDocuments();
        console.log(`   Total users: ${userCount}`);
        
        if (userCount > 0) {
            console.log('');
            console.log('   Sample users:');
            const sampleUsers = await User.find().limit(5).select('name email role');
            sampleUsers.forEach(user => {
                console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
            });
        }
        console.log('');

        // Summary
        console.log('='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        
        if (userCount > 0) {
            console.log('✅ Database connection is working correctly!');
            console.log(`✅ Found ${userCount} users in the database`);
            console.log('');
            console.log('Your database is: ' + dbName);
            console.log('Connection string: ' + process.env.MONGO_URI);
        } else {
            console.log('⚠️  Connected to database but no users found!');
            console.log('');
            console.log('POSSIBLE SOLUTIONS:');
            console.log('');
            console.log('1. Check if you\'re connected to the correct database:');
            databases.forEach(db => {
                if (db.name !== dbName && db.sizeOnDisk > 0) {
                    console.log(`   - Try: MONGO_URI=mongodb://127.0.0.1:27017/${db.name}`);
                }
            });
            console.log('');
            console.log('2. Or restore from backup if you have one');
            console.log('3. Or seed the database with initial data');
        }
        console.log('');

        process.exit(0);
    } catch (error) {
        console.log('');
        console.log('❌ ERROR:', error.message);
        console.log('');
        
        if (error.message.includes('ECONNREFUSED')) {
            console.log('SOLUTION:');
            console.log('MongoDB is not running. Start it with:');
            console.log('  Windows: net start MongoDB');
            console.log('  Or: "C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe"');
        } else if (error.message.includes('authentication')) {
            console.log('SOLUTION:');
            console.log('Check your MongoDB username and password in MONGO_URI');
        } else {
            console.log('SOLUTION:');
            console.log('1. Check if MongoDB is running');
            console.log('2. Verify MONGO_URI in .env file');
            console.log('3. Check MongoDB logs for more details');
        }
        console.log('');
        
        process.exit(1);
    }
};

findDatabase();
