const mongoose = require('mongoose');

// Set mongoose options
mongoose.set('strictPopulate', false); // Allow populate to work even if path doesn't exist in schema

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // useNewUrlParser: true, // Deprecated in newer mongoose
            // useUnifiedTopology: true,
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        // process.exit(1); // Keep server running even if DB is down for local dev stability
    }
};

module.exports = connectDB;
