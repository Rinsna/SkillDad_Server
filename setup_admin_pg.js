const { query, connectPostgres } = require('./config/postgres');
require('dotenv').config();

async function migrateAdminTables() {
    try {
        await connectPostgres();
        console.log('Creating Admin tables in PostgreSQL...');

        // 1. Partner Logos
        await query(`
            CREATE TABLE IF NOT EXISTS partner_logos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                logo TEXT,
                type TEXT DEFAULT 'corporate',
                location TEXT,
                students TEXT,
                programs TEXT,
                "order" INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Table partner_logos created.');

        // 2. Directors
        await query(`
            CREATE TABLE IF NOT EXISTS directors (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                title TEXT,
                image TEXT,
                "order" INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Table directors created.');

        console.log('Admin tables setup complete.');
    } catch (error) {
        console.error('Error setting up admin tables:', error);
    } finally {
        process.exit();
    }
}

migrateAdminTables();
