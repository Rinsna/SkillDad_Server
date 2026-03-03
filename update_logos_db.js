const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const PartnerLogo = require('./models/partnerLogoModel');

const logos = [
    { name: 'Infosys', logo: 'https://logo.clearbit.com/infosys.com', type: 'corporate', order: 1 },
    { name: 'TCS', logo: 'https://logo.clearbit.com/tcs.com', type: 'corporate', order: 2 },
    { name: 'Wipro', logo: 'https://logo.clearbit.com/wipro.com', type: 'corporate', order: 3 },
    { name: 'HCLTech', logo: 'https://logo.clearbit.com/hcltech.com', type: 'corporate', order: 4 },
    { name: 'Accenture', logo: 'https://logo.clearbit.com/accenture.com', type: 'corporate', order: 5 },
    { name: 'Capgemini', logo: 'https://logo.clearbit.com/capgemini.com', type: 'corporate', order: 6 },
    { name: 'Cognizant', logo: 'https://logo.clearbit.com/cognizant.com', type: 'corporate', order: 7 },
    { name: 'IBM', logo: 'https://logo.clearbit.com/ibm.com', type: 'corporate', order: 8 },
    { name: 'Google', logo: 'https://logo.clearbit.com/google.com', type: 'corporate', order: 9 },
    { name: 'Microsoft', logo: 'https://logo.clearbit.com/microsoft.com', type: 'corporate', order: 10 },
    { name: 'Amazon', logo: 'https://logo.clearbit.com/amazon.com', type: 'corporate', order: 11 },
    { name: 'Meta', logo: 'https://logo.clearbit.com/meta.com', type: 'corporate', order: 12 },
    { name: 'Oracle', logo: 'https://logo.clearbit.com/oracle.com', type: 'corporate', order: 13 },
    { name: 'SAP', logo: 'https://logo.clearbit.com/sap.com', type: 'corporate', order: 14 },
    { name: 'Adobe', logo: 'https://logo.clearbit.com/adobe.com', type: 'corporate', order: 15 },
    { name: 'Intel', logo: 'https://logo.clearbit.com/intel.com', type: 'corporate', order: 16 }
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
        console.log('Inserted new corporate logos with Clearbit URLs');

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

updateLogos();
