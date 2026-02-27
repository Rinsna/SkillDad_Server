const axios = require('axios');
async function test() {
    try {
        const res = await axios.get('http://localhost:3030/api/courses');
        console.log(res.status, res.data);
    } catch (e) {
        if (e.response) {
            console.log(e.response.status, e.response.data);
        } else {
            console.log(e.message);
        }
    }
}
test();
