const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const PartnerLogo = require('./models/partnerLogoModel');

const logos = [
    { name: 'Infosys', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/95/Infosys_logo.svg', type: 'corporate', order: 1 },
    { name: 'TCS', logo: 'https://cdn.worldvectorlogo.com/logos/tata-consultancy-services-1.svg', type: 'corporate', order: 2 },
    { name: 'Wipro', logo: 'https://www.vectorlogo.zone/logos/wipro/wipro-ar21.svg', type: 'corporate', order: 3 },
    { name: 'Accenture', logo: 'https://www.vectorlogo.zone/logos/accenture/accenture-ar21.svg', type: 'corporate', order: 5 },
    { name: 'IBM', logo: 'https://www.vectorlogo.zone/logos/ibm/ibm-ar21.svg', type: 'corporate', order: 8 },
    { name: 'Google', logo: 'https://www.vectorlogo.zone/logos/google/google-ar21.svg', type: 'corporate', order: 9 },
    { name: 'Microsoft', logo: 'https://www.vectorlogo.zone/logos/microsoft/microsoft-ar21.svg', type: 'corporate', order: 10 },
    { name: 'Amazon', logo: 'https://www.vectorlogo.zone/logos/amazon/amazon-ar21.svg', type: 'corporate', order: 11 },
    { name: 'Meta', logo: 'https://www.vectorlogo.zone/logos/facebook/facebook-ar21.svg', type: 'corporate', order: 12 },
    { name: 'Oracle', logo: 'https://www.vectorlogo.zone/logos/oracle/oracle-ar21.svg', type: 'corporate', order: 13 },
    { name: 'SAP', logo: 'https://www.vectorlogo.zone/logos/sap/sap-ar21.svg', type: 'corporate', order: 14 },
    { name: 'Adobe', logo: 'https://www.vectorlogo.zone/logos/adobe/adobe-ar21.svg', type: 'corporate', order: 15 },
    { name: 'Intel', logo: 'https://www.vectorlogo.zone/logos/intel/intel-ar21.svg', type: 'corporate', order: 16 }
];

const updateLogos = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        await PartnerLogo.deleteMany({ type: 'corporate' });
        await PartnerLogo.insertMany(logos);
        console.log('Inserted final corporate logos with verified URLs');
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

updateLogos();
