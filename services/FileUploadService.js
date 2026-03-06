const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const storageConfig = require('../config/fileStorage');

/**
 * File Upload Service
 * Handles file uploads for question papers and answer sheets
 * Supports both local filesystem and AWS S3 storage
 */
class FileUploadService {
  constructor() {
    this.storageType = storageConfig.type;
    this.s3Client = null;
    
    // Initialize S3 client if using S3 storage
    if (this.storageType === 's3') {
      this.initializeS3Client();
    }
  }

  /**
   * Initialize AWS S3 client
   */
  initializeS3Client() {
    try {
      const { S3Client } = require('@aws-sdk/client-s3');
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      
      this.s3Client = new S3Client({
        region: storageConfig.s3.region,
        credentials: {
          accessKeyId: storageConfig.s3.accessKeyId,
          secretAccessKey: storageConfig.s3.secretAccessKey,
        },
      });
      
      this.S3Commands = { GetObjectCommand, PutObjectCommand, DeleteObjectCommand };
      this.getSignedUrl = getSignedUrl;
    } catch (error) {
      console.warn('AWS SDK not available. Falling back to local storage.');
      this.storageType = 'local';
    }
  }

  /**
   * Generate secure random filename
   * @param {string} originalName - Original filename
   * @returns {string} Randomized filename
   */
  generateSecureFilename(originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const randomString = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    return `${randomString}-${timestamp}${ext}`;
  }

  /**
   * Validate file type and size with enhanced security checks
   * @param {Object} file - Multer file object
   * @param {string} fileType - 'questionPaper' or 'answerSheet'
   * @returns {Object} { valid: boolean, error?: string }
   */
  validateFile(file, fileType) {
    if (!file) {
      return { valid: false, error: 'No file provided' };
    }

    const limits = storageConfig.limits[fileType];
    if (!limits) {
      return { valid: false, error: 'Invalid file type specified' };
    }

    // Check file size
    if (file.size > limits.maxSize) {
      const maxSizeMB = limits.maxSize / (1024 * 1024);
      return { 
        valid: false, 
        error: `File size exceeds ${maxSizeMB}MB limit` 
      };
    }

    // Check for minimum file size (prevent empty files)
    if (file.size < 100) {
      return {
        valid: false,
        error: 'File is too small or empty'
      };
    }

    // Check MIME type from multer
    if (!limits.allowedTypes.includes(file.mimetype)) {
      return { 
        valid: false, 
        error: `Invalid file type. Allowed types: ${limits.allowedTypes.join(', ')}` 
      };
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!limits.allowedExtensions.includes(ext)) {
      return { 
        valid: false, 
        error: `Invalid file extension. Allowed extensions: ${limits.allowedExtensions.join(', ')}` 
      };
    }

    // Additional security: Validate file signature (magic numbers) for PDFs
    if (ext === '.pdf') {
      const isValidPDF = this.validatePDFSignature(file);
      if (!isValidPDF) {
        return {
          valid: false,
          error: 'File does not appear to be a valid PDF'
        };
      }
    }

    // Additional security: Validate image signatures for common formats
    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      const isValidImage = this.validateImageSignature(file, ext);
      if (!isValidImage) {
        return {
          valid: false,
          error: 'File does not appear to be a valid image'
        };
      }
    }

    // Check for suspicious file names
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /[<>:"|?*]/,  // Invalid characters
      /\0/,  // Null bytes
      /\.exe$/i,  // Executable
      /\.sh$/i,  // Shell script
      /\.bat$/i,  // Batch file
      /\.cmd$/i,  // Command file
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.originalname)) {
        return {
          valid: false,
          error: 'File name contains suspicious characters or patterns'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validate PDF file signature (magic numbers)
   * @param {Object} file - Multer file object
   * @returns {boolean} True if valid PDF
   */
  validatePDFSignature(file) {
    try {
      const buffer = file.buffer || fsSync.readFileSync(file.path);
      // PDF files start with %PDF-
      const pdfSignature = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);
      return buffer.slice(0, 5).equals(pdfSignature);
    } catch (error) {
      console.error('Error validating PDF signature:', error);
      return false;
    }
  }

  /**
   * Validate image file signature (magic numbers)
   * @param {Object} file - Multer file object
   * @param {string} ext - File extension
   * @returns {boolean} True if valid image
   */
  validateImageSignature(file, ext) {
    try {
      const buffer = file.buffer || fsSync.readFileSync(file.path);
      
      // JPEG signature: FF D8 FF
      if (ext === '.jpg' || ext === '.jpeg') {
        return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      }
      
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      if (ext === '.png') {
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        return buffer.slice(0, 8).equals(pngSignature);
      }
      
      return false;
    } catch (error) {
      console.error('Error validating image signature:', error);
      return false;
    }
  }

  /**
   * Upload question paper for an exam
   * @param {Object} file - Multer file object
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} { url, filename, size }
   */
  async uploadQuestionPaper(file, examId) {
    // Validate file
    const validation = this.validateFile(file, 'questionPaper');
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate secure filename
    const filename = this.generateSecureFilename(file.originalname);
    const filePath = `question-papers/${examId}/${filename}`;

    // Upload based on storage type
    if (this.storageType === 's3') {
      return await this.uploadToS3(file, filePath);
    } else {
      return await this.uploadToLocal(file, filePath);
    }
  }

  /**
   * Upload answer sheet for a submission
   * @param {Object} file - Multer file object
   * @param {string} examId - Exam ID
   * @param {string} studentId - Student ID
   * @returns {Promise<Object>} { url, filename, size }
   */
  async uploadAnswerSheet(file, examId, studentId) {
    // Validate file
    const validation = this.validateFile(file, 'answerSheet');
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate secure filename
    const filename = this.generateSecureFilename(file.originalname);
    const filePath = `answer-sheets/${examId}/${studentId}/${filename}`;

    // Upload based on storage type
    if (this.storageType === 's3') {
      return await this.uploadToS3(file, filePath);
    } else {
      return await this.uploadToLocal(file, filePath);
    }
  }

  /**
   * Upload file to local filesystem
   * @param {Object} file - Multer file object
   * @param {string} filePath - Relative file path
   * @returns {Promise<Object>} { url, filename, size }
   */
  async uploadToLocal(file, filePath) {
    const fullPath = path.join(storageConfig.local.baseDir, filePath);
    const directory = path.dirname(fullPath);

    // Ensure directory exists
    await fs.mkdir(directory, { recursive: true });

    // Copy file from temp location to final destination
    if (file.path) {
      // File is already on disk (from multer diskStorage)
      await fs.copyFile(file.path, fullPath);
      // Clean up temp file
      await fs.unlink(file.path).catch(() => {});
    } else if (file.buffer) {
      // File is in memory (from multer memoryStorage)
      await fs.writeFile(fullPath, file.buffer);
    } else {
      throw new Error('Invalid file object');
    }

    return {
      url: `/uploads/exams/${filePath}`,
      filename: path.basename(filePath),
      size: file.size,
      storage: 'local',
    };
  }

  /**
   * Upload file to AWS S3
   * @param {Object} file - Multer file object
   * @param {string} filePath - S3 object key
   * @returns {Promise<Object>} { url, filename, size }
   */
  async uploadToS3(file, filePath) {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    const fileBuffer = file.buffer || await fs.readFile(file.path);

    const command = new this.S3Commands.PutObjectCommand({
      Bucket: storageConfig.s3.bucket,
      Key: filePath,
      Body: fileBuffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    // Clean up temp file if it exists
    if (file.path) {
      await fs.unlink(file.path).catch(() => {});
    }

    return {
      url: `s3://${storageConfig.s3.bucket}/${filePath}`,
      filename: path.basename(filePath),
      size: file.size,
      storage: 's3',
      key: filePath,
    };
  }

  /**
   * Delete file from storage
   * @param {string} fileUrl - File URL or path
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(fileUrl) {
    if (!fileUrl) {
      return false;
    }

    try {
      if (fileUrl.startsWith('s3://')) {
        return await this.deleteFromS3(fileUrl);
      } else {
        return await this.deleteFromLocal(fileUrl);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Delete file from local filesystem
   * @param {string} fileUrl - File URL
   * @returns {Promise<boolean>} Success status
   */
  async deleteFromLocal(fileUrl) {
    // Extract path from URL (remove /uploads/exams prefix)
    const relativePath = fileUrl.replace('/uploads/exams/', '');
    const fullPath = path.join(storageConfig.local.baseDir, relativePath);

    if (fsSync.existsSync(fullPath)) {
      await fs.unlink(fullPath);
      return true;
    }

    return false;
  }

  /**
   * Delete file from AWS S3
   * @param {string} fileUrl - S3 URL (s3://bucket/key)
   * @returns {Promise<boolean>} Success status
   */
  async deleteFromS3(fileUrl) {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from S3 URL
    const key = fileUrl.replace(`s3://${storageConfig.s3.bucket}/`, '');

    const command = new this.S3Commands.DeleteObjectCommand({
      Bucket: storageConfig.s3.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
    return true;
  }

  /**
   * Generate time-limited signed URL for secure file access
   * @param {string} fileUrl - File URL or path
   * @param {number} expiresIn - Expiry time in seconds (default: 3600)
   * @returns {Promise<Object>} { url, expiresAt }
   */
  async generateSecureUrl(fileUrl, expiresIn = 3600) {
    if (!fileUrl) {
      throw new Error('File URL is required');
    }

    if (fileUrl.startsWith('s3://')) {
      return await this.generateS3SignedUrl(fileUrl, expiresIn);
    } else {
      // For local storage, return the URL with expiry timestamp
      // In production, you might want to implement token-based access
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      return {
        url: fileUrl,
        expiresAt,
        storage: 'local',
      };
    }
  }

  /**
   * Generate S3 pre-signed URL
   * @param {string} fileUrl - S3 URL
   * @param {number} expiresIn - Expiry time in seconds
   * @returns {Promise<Object>} { url, expiresAt }
   */
  async generateS3SignedUrl(fileUrl, expiresIn) {
    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    // Extract key from S3 URL
    const key = fileUrl.replace(`s3://${storageConfig.s3.bucket}/`, '');

    const command = new this.S3Commands.GetObjectCommand({
      Bucket: storageConfig.s3.bucket,
      Key: key,
    });

    const signedUrl = await this.getSignedUrl(this.s3Client, command, {
      expiresIn,
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      url: signedUrl,
      expiresAt,
      storage: 's3',
    };
  }

  /**
   * Delete all files associated with an exam
   * @param {string} examId - Exam ID
   * @returns {Promise<Object>} { deletedCount, errors }
   */
  async deleteExamFiles(examId) {
    const results = {
      deletedCount: 0,
      errors: [],
    };

    try {
      if (this.storageType === 's3') {
        // For S3, we would need to list and delete all objects with the exam prefix
        // This is a simplified version
        const questionPaperPrefix = `question-papers/${examId}/`;
        const answerSheetPrefix = `answer-sheets/${examId}/`;
        
        // Note: In production, implement proper S3 batch deletion
        console.log(`Would delete S3 objects with prefixes: ${questionPaperPrefix}, ${answerSheetPrefix}`);
      } else {
        // For local storage, delete directories
        const questionPaperDir = path.join(
          storageConfig.local.baseDir,
          'question-papers',
          examId
        );
        const answerSheetDir = path.join(
          storageConfig.local.baseDir,
          'answer-sheets',
          examId
        );

        // Delete question paper directory
        if (fsSync.existsSync(questionPaperDir)) {
          await fs.rm(questionPaperDir, { recursive: true, force: true });
          results.deletedCount++;
        }

        // Delete answer sheet directory
        if (fsSync.existsSync(answerSheetDir)) {
          await fs.rm(answerSheetDir, { recursive: true, force: true });
          results.deletedCount++;
        }
      }
    } catch (error) {
      results.errors.push(error.message);
    }

    return results;
  }
}

// Export singleton instance
module.exports = new FileUploadService();
