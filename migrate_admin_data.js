const mongoose = require('mongoose');
const { query, connectPostgres } = require('./config/postgres');
const PartnerLogo = require('./models/partnerLogoModel');
const Director = require('./models/directorModel');
require('dotenv').config();

async function migrateData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
        await connectPostgres();
        console.log('PostgreSQL Connected');

        // 1. Migrate Partner Logos
        const logos = await PartnerLogo.find();
        console.log(`Found ${logos.length} partner logos in MongoDB`);

        for (const logo of logos) {
            await query(`
                INSERT INTO partner_logos (name, logo, type, location, students, programs, "order", is_active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT DO NOTHING
            `, [
                logo.name,
                logo.logo,
                logo.type,
                logo.location,
                logo.students,
                logo.programs,
                logo.order,
                logo.isActive,
                logo.createdAt
            ]);
        }
        console.log('Partner logos migrated.');

        // 2. Migrate Directors
        const directors = await Director.find();
        console.log(`Found ${directors.length} directors in MongoDB`);

        for (const director of directors) {
            await query(`
                INSERT INTO directors (name, title, image, "order", is_active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
            `, [
                director.name,
                director.title,
                director.image,
                director.order,
                director.isActive,
                director.createdAt
            ]);
        }
        console.log('Directors migrated.');

        console.log('Migration complete.');
    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

migrateData();
