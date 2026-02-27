const fs = require('fs');
const content = fs.readFileSync('session_data.json', 'utf16le');
console.log(content.replace(/^\uFEFF/, '')); // Remove BOM if present
