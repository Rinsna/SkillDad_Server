const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const PartnerLogo = require('./models/partnerLogoModel');

const logos = [
    { name: 'Infosys', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/95/Infosys_logo.svg', type: 'corporate', order: 1 },
    { name: 'TCS', logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Tata_Consultancy_Services_Logo.svg', type: 'corporate', order: 2 },
    { name: 'Wipro', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Wipro_Primary_Logo_Color_RGB.svg', type: 'corporate', order: 3 },
    { name: 'Accenture', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Accenture.svg', type: 'corporate', order: 5 },
    { name: 'IBM', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg', type: 'corporate', order: 8 },
    { name: 'Google', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg', type: 'corporate', order: 9 },
    { name: 'Microsoft', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg', type: 'corporate', order: 10 },
    { name: 'Amazon', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg', type: 'corporate', order: 11 },
    { name: 'Meta', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg', type: 'corporate', order: 12 },
    { name: 'Oracle', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/50/Oracle_logo.svg', type: 'corporate', order: 13 },
    { name: 'SAP', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/59/SAP_2011_logo.svg', type: 'corporate', order: 14 },
    { name: 'Adobe', logo: 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Adobe_Corporate_Logo.svg', type: 'corporate', order: 15 },
    { name: 'Intel', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c9/Intel-logo.svg', type: 'corporate', order: 16 }
];

const updateLogos = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Remove existing corporate logos to reset
        await PartnerLogo.deleteMany({ type: 'corporate' });
        console.log('Removed old corporate logos');

        // Insert new ones
        await PartnerLogo.insertMany(logos);
        console.log('Inserted new corporate logos with Wikimedia SVGs');

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

updateLogos();
