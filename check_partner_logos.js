const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const PartnerLogo = require('./models/partnerLogoModel');

const checkLogos = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const logos = await PartnerLogo.find({});
        console.log(JSON.stringify(logos, null, 2));
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkLogos();
