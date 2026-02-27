const mongoose = require('mongoose');
const dotenv = require('dotenv');
const GatewayConfig = require('./models/payment/GatewayConfig');
const User = require('./models/userModel');
const bcrypt = require('bcryptjs');

// Load env vars
dotenv.config();

/**
 * PRODUCTION INITIALIZATION SCRIPT
 * 
 * This script:
 * 1. Synchronizes the HDFC Payment Gateway configuration with Production credentials.
 * 2. Ensures at least one Super Admin exists with specified credentials.
 */

const initializeProduction = async () => {
    try {
        console.log('--- Starting Production Initialization ---');

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB Strategy...');

        // 1. Initialize Payment Gateway Config
        console.log('\nConfiguring HDFC Payment Gateway...');
        await GatewayConfig.findOneAndUpdate(
            { isActive: true },
            {
                name: 'HDFC SmartGateway',
                environment: 'production',
                merchantId: process.env.HDFC_MERCHANT_ID,
                apiKey: process.env.HDFC_API_KEY,
                apiSecret: process.env.HDFC_API_SECRET,
                encryptionKey: process.env.HDFC_ENCRYPTION_KEY,
                gatewayUrl: process.env.HDFC_GATEWAY_URL || 'https://api.hdfcbank.com/v1',
                callbackUrl: process.env.HDFC_CALLBACK_URL,
                webhookUrl: process.env.HDFC_WEBHOOK_URL,
                isActive: true,
                maintenanceMode: false,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        console.log('✅ Payment Gateway Configured for PRODUCTION.');

        // 2. Ensure Super Admin Account
        console.log('\nChecking Admin Credentials...');
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@skilldad.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'SkillDadPro2026!';

        let admin = await User.findOne({ email: adminEmail });

        if (!admin) {
            admin = await User.create({
                name: 'SkillDad Super Admin',
                email: adminEmail,
                password: adminPassword,
                role: 'admin',
                isVerified: true
            });
            console.log(`✅ Super Admin created: ${adminEmail}`);
        } else {
            admin.role = 'admin';
            admin.isVerified = true;
            if (process.env.RESET_ADMIN_PASSWORD === 'true') {
                admin.password = adminPassword;
            }
            await admin.save();
            console.log(`✅ Admin account verified: ${adminEmail}`);
        }

        console.log('\n--- Initialization Complete ---');
        console.log('The platform is now in Production mode.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during initialization:', error.message);
        process.exit(1);
    }
};

initializeProduction();
