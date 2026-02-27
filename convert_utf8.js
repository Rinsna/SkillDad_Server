const fs = require('fs');
const content = fs.readFileSync('session_data.json', 'utf16le');
fs.writeFileSync('session_data_utf8.json', content, 'utf8');
