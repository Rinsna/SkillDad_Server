const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb+srv://rinsnac4_db_user:IWtudXhFbzDtPWsK@cluster0.xm5mhac.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
const LOCAL_URI = 'mongodb://127.0.0.1:27017/skilldad';

async function copyMissingData() {
    let atlasConn = null;
    let localConn = null;

    try {
        console.log('Connecting to Atlas...');
        atlasConn = await mongoose.createConnection(ATLAS_URI).asPromise();
        console.log('Connected to Atlas (test db)!');

        console.log('Connecting to Local DB...');
        localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
        console.log('Connected to Local DB (skilldad db)!');

        const atlasDb = atlasConn.db;
        const localDb = localConn.db;

        const allAtlasCollections = await atlasDb.listCollections().toArray();
        const collectionNames = allAtlasCollections.map(c => c.name);

        console.log(`Found ${collectionNames.length} collections in Atlas.`);

        let totalInserted = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        for (const colName of collectionNames) {
            if (colName.startsWith('system.')) continue;

            const atlasCol = atlasDb.collection(colName);
            const localCol = localDb.collection(colName);

            const documents = await atlasCol.find({}).toArray();
            let inserted = 0;
            let skipped = 0;
            let errors = 0;

            if (documents.length === 0) continue;

            for (const doc of documents) {
                const exists = await localCol.findOne({ _id: doc._id });
                if (!exists) {
                    try {
                        await localCol.insertOne(doc);
                        inserted++;
                    } catch (err) {
                        if (err.code === 11000) {
                            // Duplicate key error on another field, e.g. email
                            skipped++;
                        } else {
                            console.error(`Error inserting into ${colName}:`, err.message);
                            errors++;
                        }
                    }
                } else {
                    skipped++;
                }
            }

            console.log(`Collection: ${colName.padEnd(25)} | Inserted: ${inserted.toString().padEnd(4)} | Skipped: ${skipped.toString().padEnd(4)} | Errors: ${errors.toString().padEnd(4)}`);
            totalInserted += inserted;
            totalSkipped += skipped;
            totalErrors += errors;
        }

        console.log(`\nMigration completed!`);
        console.log(`Total new documents inserted: ${totalInserted}`);
        console.log(`Total existing documents skipped (or duplicate): ${totalSkipped}`);
        console.log(`Total errors: ${totalErrors}`);

    } catch (e) {
        console.error('Error during migration:', e);
    } finally {
        if (atlasConn) await atlasConn.close();
        if (localConn) await localConn.close();
        console.log('Connections closed.');
    }
}

copyMissingData();
