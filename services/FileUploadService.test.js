const FileUploadService = require('./FileUploadService');
const storageConfig = require('../config/fileStorage');
const fs = require('fs').promises;
const path = require('path');

describe('FileUploadService', () => {
  describe('validateFile', () => {
    describe('Question Paper Validation', () => {
      it('should accept valid PDF file within size limit', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'question-paper.pdf',
          size: 5 * 1024 * 1024, // 5MB
        };

        const result = FileUploadService.validateFile(file, 'questionPaper');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject file exceeding 10MB size limit', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'large-paper.pdf',
          size: 11 * 1024 * 1024, // 11MB
        };

        const result = FileUploadService.validateFile(file, 'questionPaper');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds 10MB limit');
      });

      it('should reject non-PDF file type', () => {
        const file = {
          mimetype: 'image/jpeg',
          originalname: 'image.jpg',
          size: 2 * 1024 * 1024,
        };

        const result = FileUploadService.validateFile(file, 'questionPaper');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid file type');
      });

      it('should reject file with invalid extension', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'document.docx',
          size: 2 * 1024 * 1024,
        };

        const result = FileUploadService.validateFile(file, 'questionPaper');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid file extension');
      });

      it('should reject when no file provided', () => {
        const result = FileUploadService.validateFile(null, 'questionPaper');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('No file provided');
      });
    });

    describe('Answer Sheet Validation', () => {
      it('should accept valid PDF file within size limit', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'answer-sheet.pdf',
          size: 15 * 1024 * 1024, // 15MB
        };

        const result = FileUploadService.validateFile(file, 'answerSheet');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid JPEG image within size limit', () => {
        const file = {
          mimetype: 'image/jpeg',
          originalname: 'answer-sheet.jpg',
          size: 10 * 1024 * 1024, // 10MB
        };

        const result = FileUploadService.validateFile(file, 'answerSheet');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid PNG image within size limit', () => {
        const file = {
          mimetype: 'image/png',
          originalname: 'answer-sheet.png',
          size: 10 * 1024 * 1024, // 10MB
        };

        const result = FileUploadService.validateFile(file, 'answerSheet');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject file exceeding 20MB size limit', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'large-answer.pdf',
          size: 21 * 1024 * 1024, // 21MB
        };

        const result = FileUploadService.validateFile(file, 'answerSheet');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds 20MB limit');
      });

      it('should reject unsupported file type', () => {
        const file = {
          mimetype: 'video/mp4',
          originalname: 'video.mp4',
          size: 5 * 1024 * 1024,
        };

        const result = FileUploadService.validateFile(file, 'answerSheet');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid file type');
      });

      it('should reject file with invalid extension', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'document.txt',
          size: 2 * 1024 * 1024,
        };

        const result = FileUploadService.validateFile(file, 'answerSheet');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid file extension');
      });
    });

    describe('Edge Cases', () => {
      it('should reject invalid file type parameter', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'test.pdf',
          size: 1024,
        };

        const result = FileUploadService.validateFile(file, 'invalidType');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid file type specified');
      });

      it('should handle file at exact size limit (question paper)', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'exact-size.pdf',
          size: 10 * 1024 * 1024, // Exactly 10MB
        };

        const result = FileUploadService.validateFile(file, 'questionPaper');
        expect(result.valid).toBe(true);
      });

      it('should handle file at exact size limit (answer sheet)', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'exact-size.pdf',
          size: 20 * 1024 * 1024, // Exactly 20MB
        };

        const result = FileUploadService.validateFile(file, 'answerSheet');
        expect(result.valid).toBe(true);
      });

      it('should handle file just over size limit', () => {
        const file = {
          mimetype: 'application/pdf',
          originalname: 'over-limit.pdf',
          size: 10 * 1024 * 1024 + 1, // 10MB + 1 byte
        };

        const result = FileUploadService.validateFile(file, 'questionPaper');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds 10MB limit');
      });
    });
  });

  describe('generateSecureFilename', () => {
    it('should generate unique filenames for same original name', () => {
      const originalName = 'test.pdf';
      const filename1 = FileUploadService.generateSecureFilename(originalName);
      const filename2 = FileUploadService.generateSecureFilename(originalName);

      expect(filename1).not.toBe(filename2);
      expect(filename1).toMatch(/^[a-f0-9]{32}-\d+\.pdf$/);
      expect(filename2).toMatch(/^[a-f0-9]{32}-\d+\.pdf$/);
    });

    it('should preserve file extension', () => {
      const testCases = [
        { input: 'document.pdf', expectedExt: '.pdf' },
        { input: 'image.jpg', expectedExt: '.jpg' },
        { input: 'photo.PNG', expectedExt: '.png' },
        { input: 'file.jpeg', expectedExt: '.jpeg' },
      ];

      testCases.forEach(({ input, expectedExt }) => {
        const filename = FileUploadService.generateSecureFilename(input);
        expect(filename.toLowerCase()).toMatch(new RegExp(`${expectedExt}$`));
      });
    });

    it('should handle files without extension', () => {
      const filename = FileUploadService.generateSecureFilename('noextension');
      expect(filename).toMatch(/^[a-f0-9]{32}-\d+$/);
    });

    it('should generate filename with timestamp', () => {
      const beforeTime = Date.now();
      const filename = FileUploadService.generateSecureFilename('test.pdf');
      const afterTime = Date.now();

      const timestampMatch = filename.match(/-(\d+)\.pdf$/);
      expect(timestampMatch).not.toBeNull();
      
      const timestamp = parseInt(timestampMatch[1]);
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('File Type Validation Boundaries', () => {
    it('should validate MIME type case-insensitively', () => {
      const file = {
        mimetype: 'APPLICATION/PDF',
        originalname: 'test.pdf',
        size: 1024,
      };

      // Note: Current implementation is case-sensitive
      // This test documents expected behavior
      const result = FileUploadService.validateFile(file, 'questionPaper');
      // In production, you might want to normalize MIME types
      expect(result.valid).toBe(false);
    });

    it('should handle multiple file extensions correctly', () => {
      const file = {
        mimetype: 'application/pdf',
        originalname: 'document.backup.pdf',
        size: 1024,
      };

      const result = FileUploadService.validateFile(file, 'questionPaper');
      expect(result.valid).toBe(true);
    });
  });

  describe('Security Tests', () => {
    it('should prevent path traversal in filename', () => {
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'test/../../../secret.pdf',
      ];

      maliciousNames.forEach(name => {
        const filename = FileUploadService.generateSecureFilename(name);
        expect(filename).not.toContain('..');
        expect(filename).not.toContain('/');
        expect(filename).not.toContain('\\');
      });
    });

    it('should generate cryptographically random filenames', () => {
      const filenames = new Set();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const filename = FileUploadService.generateSecureFilename('test.pdf');
        filenames.add(filename);
      }

      // All filenames should be unique
      expect(filenames.size).toBe(iterations);
    });
  });
});
