const { query, connectPostgres } = require('./config/postgres');
require('dotenv').config();

async function check() {
    await connectPostgres();
    const res = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    const names = res.rows.map(r => r.table_name);
    console.log('Total Tables:', names.length);
    for (let i = 0; i < names.length; i += 10) {
        console.log(names.slice(i, i + 10).join(', '));
    }
    process.exit();
}

check();
