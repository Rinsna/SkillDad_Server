const axios = require('axios');
async function testCallback() {
    try {
        const res = await axios.get('http://localhost:3030/api/payment/callback?transactionId=TXN_MM31E6GK_LLSY4P&status=success&gatewayTransactionId=pi_3T4xLRRuYOARImSF15PV1kUN', { maxRedirects: 0 });
        console.log("SUCCESS:", res.data);
    } catch (e) {
        if (e.response && (e.response.status === 301 || e.response.status === 302)) {
            console.log("REDIRECT", e.response.headers.location);
        } else {
            console.log("ERROR status:", e.response?.status);
            console.log("ERROR data:", e.response?.data);
        }
    }
}
testCallback();
