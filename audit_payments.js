const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

const paymentSchema = new mongoose.Schema({
    student: mongoose.Schema.Types.ObjectId,
    course: mongoose.Schema.Types.ObjectId,
    amount: Number,
    status: String,
    paymentMethod: String,
    partner: mongoose.Schema.Types.ObjectId,
    center: String,
    transactionId: String,
    screenshotUrl: String
}, { timestamps: true });

async function audit() {
    await mongoose.connect(process.env.MONGO_URI);

    const Payment = mongoose.model('Payment', paymentSchema);

    const count = await Payment.countDocuments();
    const pending = await Payment.countDocuments({ status: 'pending' });
    const approved = await Payment.countDocuments({ status: 'approved' });
    const withPartner = await Payment.countDocuments({ partner: { $ne: null } });
    const withoutTxnId = await Payment.countDocuments({ transactionId: null });
    const sample = await Payment.findOne({}).lean();

    console.log('=== Payment Audit ===');
    console.log('Total Payments:', count);
    console.log('Pending:', pending, '| Approved:', approved);
    console.log('With Partner:', withPartner, '| Missing TxnID:', withoutTxnId);
    if (sample) {
        console.log('\nSample payment:');
        console.log('  transactionId:', sample.transactionId || 'MISSING');
        console.log('  center:', sample.center || 'MISSING');
        console.log('  partner:', sample.partner ? sample.partner.toString() : 'null');
        console.log('  status:', sample.status);
        console.log('  amount:', sample.amount);
    }

    process.exit(0);
}

audit().catch(e => { console.error(e); process.exit(1); });
