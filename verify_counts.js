const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/skilldad';

async function verifyCounts() {
    let localConn = null;

    try {
        console.log('Connecting to Local DB...');
        localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
        console.log('Connected to Local DB (skilldad db)!');

        const localDb = localConn.db;
        const allCollections = await localDb.listCollections().toArray();

        console.log('\n--- Local DB Collection Counts ---');
        for (const col of allCollections) {
            if (col.name.startsWith('system.')) continue;
            const count = await localDb.collection(col.name).countDocuments();
            console.log(`${col.name.padEnd(25)}: ${count}`);
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        if (localConn) await localConn.close();
    }
}

verifyCounts();
