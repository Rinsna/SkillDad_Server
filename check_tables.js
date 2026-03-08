const { query, connectPostgres } = require('./config/postgres');
require('dotenv').config();

async function check() {
    await connectPostgres();
    const tables = ['courses', 'enrollments', 'payments', 'progress', 'discounts', 'users', 'partner_logos', 'directors'];
    const res = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('All tables:', res.rows.map(r => r.table_name).join(', '));
    process.exit();
}

check();
