/**
 * Seed Partner Logos Script
 * Run this to add sample B2B partner companies with logos
 * 
 * Usage: node server/scripts/seedPartnerLogos.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PartnerLogo = require('../models/partnerLogoModel');

// Sample B2B Partner Companies
const samplePartners = [
    {
        name: 'TechCorp Solutions',
        logo: '/assets/logos/techcorp.png',
        type: 'corporate',
        order: 1,
        isActive: true
    },
    {
        name: 'Global Innovations Ltd',
        logo: '/assets/logos/global-innovations.png',
        type: 'corporate',
        order: 2,
        isActive: true
    },
    {
        name: 'Digital Dynamics Inc',
        logo: '/assets/logos/digital-dynamics.png',
        type: 'corporate',
        order: 3,
        isActive: true
    },
    {
        name: 'Enterprise Systems Group',
        logo: '/assets/logos/enterprise-systems.png',
        type: 'corporate',
        order: 4,
        isActive: true
    },
    {
        name: 'CloudTech Partners',
        logo: '/assets/logos/cloudtech.png',
        type: 'corporate',
        order: 5,
        isActive: true
    },
    {
        name: 'DataFlow Corporation',
        logo: '/assets/logos/dataflow.png',
        type: 'corporate',
        order: 6,
        isActive: true
    },
    {
        name: 'NextGen Technologies',
        logo: '/assets/logos/nextgen.png',
        type: 'corporate',
        order: 7,
        isActive: true
    },
    {
        name: 'Smart Solutions International',
        logo: '/assets/logos/smart-solutions.png',
        type: 'corporate',
        order: 8,
        isActive: true
    },
    {
        name: 'Innovate Labs',
        logo: '/assets/logos/innovate-labs.png',
        type: 'corporate',
        order: 9,
        isActive: true
    }
];

async function seedPartnerLogos() {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB');

        // Clear existing partner logos (optional - comment out if you want to keep existing)
        console.log('\nClearing existing partner logos...');
        const deleteResult = await PartnerLogo.deleteMany({});
        console.log(`✓ Deleted ${deleteResult.deletedCount} existing partner logos`);

        // Insert sample partners
        console.log('\nInserting sample partner logos...');
        const inserted = await PartnerLogo.insertMany(samplePartners);
        console.log(`✓ Inserted ${inserted.length} partner logos`);

        // Display inserted partners
        console.log('\n📋 Inserted Partners:');
        inserted.forEach((partner, index) => {
            console.log(`   ${index + 1}. ${partner.name} (${partner.type})`);
        });

        console.log('\n✅ Seed completed successfully!');
        console.log('\n📝 Next Steps:');
        console.log('   1. Replace placeholder logo paths with actual logo files');
        console.log('   2. Upload logo images to client/public/assets/logos/');
        console.log('   3. Refresh your admin panel to see the partners');

    } catch (error) {
        console.error('❌ Error seeding partner logos:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n✓ Database connection closed');
    }
}

// Run the seed function
seedPartnerLogos();
