const mongoose = require('mongoose');
const GatewayConfig = require('./models/payment/GatewayConfig');
require('dotenv').config();

const checkEnv = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const config = await GatewayConfig.findOne({ isActive: true });
        console.log('Gateway Config Environment:', config.environment);
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkEnv();
