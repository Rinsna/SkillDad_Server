const path = require('path');
const fs = require('fs');

/**
 * File Storage Configuration
 * Supports both local filesystem (development) and AWS S3 (production)
 */

const storageConfig = {
  // Storage type: 'local' or 's3'
  type: process.env.FILE_STORAGE_TYPE || 'local',
  
  // Local storage configuration
  local: {
    baseDir: path.join(__dirname, '../uploads/exams'),
    questionPapersDir: 'question-papers',
    answerSheetsDir: 'answer-sheets',
  },
  
  // AWS S3 configuration
  s3: {
    bucket: process.env.AWS_S3_BUCKET || 'skilldad-exams',
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    signedUrlExpiry: parseInt(process.env.S3_SIGNED_URL_EXPIRY) || 3600, // 1 hour default
  },
  
  // File validation limits
  limits: {
    questionPaper: {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: ['application/pdf'],
      allowedExtensions: ['.pdf'],
    },
    answerSheet: {
      maxSize: 20 * 1024 * 1024, // 20MB
      allowedTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
      allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    },
  },
};

/**
 * Ensure local storage directories exist
 */
function ensureLocalDirectories() {
  if (storageConfig.type === 'local') {
    const dirs = [
      storageConfig.local.baseDir,
      path.join(storageConfig.local.baseDir, storageConfig.local.questionPapersDir),
      path.join(storageConfig.local.baseDir, storageConfig.local.answerSheetsDir),
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
}

// Initialize directories on module load
ensureLocalDirectories();

module.exports = storageConfig;
