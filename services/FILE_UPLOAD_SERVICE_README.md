# File Upload Service - Exam Management System

## Overview

The File Upload Service provides secure file handling for the Exam Management System, supporting both question paper uploads (PDF) and answer sheet uploads (PDF/images). The service is designed to work with both local filesystem storage (development) and AWS S3 (production).

## Features

- **Dual Storage Support**: Local filesystem for development, AWS S3 for production
- **File Validation**: Type, size, and extension validation
- **Security**: Randomized filenames to prevent path traversal attacks
- **Organized Storage**: Files organized by exam ID and student ID
- **Secure Access**: Time-limited signed URLs for file downloads
- **Automatic Cleanup**: Delete old files when replaced or exams deleted

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Storage type: 'local' (development) or 's3' (production)
FILE_STORAGE_TYPE=local

# AWS S3 Configuration (only needed if FILE_STORAGE_TYPE=s3)
AWS_S3_BUCKET=skilldad-exams
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
S3_SIGNED_URL_EXPIRY=3600
```

### File Limits

**Question Papers:**
- Maximum size: 10MB
- Allowed types: PDF only
- Allowed extensions: `.pdf`

**Answer Sheets:**
- Maximum size: 20MB
- Allowed types: PDF, JPEG, PNG
- Allowed extensions: `.pdf`, `.jpg`, `.jpeg`, `.png`

## API Endpoints

### 1. Upload Question Paper

**Endpoint:** `POST /api/exams/:examId/question-paper`

**Access:** University, Admin

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `questionPaper`
- File: PDF file (max 10MB)

**Response:**
```json
{
  "success": true,
  "message": "Question paper uploaded successfully",
  "data": {
    "questionPaperUrl": "/uploads/exams/question-papers/...",
    "filename": "abc123-1234567890.pdf",
    "size": 2048576
  }
}
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('questionPaper', file);

const response = await fetch(`/api/exams/${examId}/question-paper`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### 2. Get Question Paper Download URL

**Endpoint:** `GET /api/exams/:examId/question-paper/download`

**Access:** Student (during exam window), University, Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://...",
    "expiresAt": "2024-01-15T10:00:00Z",
    "examTitle": "Midterm Exam",
    "courseTitle": "Data Structures"
  }
}
```

**Access Control:**
- Students can only access during exam time window
- Must be enrolled in the course
- University and Admin can always access

### 3. Upload Answer Sheet

**Endpoint:** `POST /api/exams/:examId/submissions/:submissionId/answer-sheet`

**Access:** Student (owner of submission)

**Request:**
- Content-Type: `multipart/form-data`
- Field name: `answerSheet`
- File: PDF or image file (max 20MB)

**Response:**
```json
{
  "success": true,
  "message": "Answer sheet uploaded successfully",
  "data": {
    "answerSheetUrl": "/uploads/exams/answer-sheets/...",
    "filename": "def456-1234567890.pdf",
    "size": 5242880
  }
}
```

**Example (JavaScript):**
```javascript
const formData = new FormData();
formData.append('answerSheet', file);

const response = await fetch(
  `/api/exams/${examId}/submissions/${submissionId}/answer-sheet`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  }
);
```

### 4. Get Answer Sheet Download URL

**Endpoint:** `GET /api/exams/:examId/submissions/:submissionId/answer-sheet/download`

**Access:** Student (owner), University (exam owner), Admin

**Response:**
```json
{
  "success": true,
  "data": {
    "url": "https://...",
    "expiresAt": "2024-01-15T10:00:00Z",
    "studentName": "John Doe",
    "examTitle": "Midterm Exam"
  }
}
```

### 5. Delete Exam Files

**Endpoint:** `DELETE /api/exams/:examId/files`

**Access:** Admin only

**Response:**
```json
{
  "success": true,
  "message": "Exam files deleted successfully",
  "data": {
    "deletedCount": 2,
    "errors": []
  }
}
```

## File Storage Structure

### Local Storage

```
server/uploads/exams/
├── question-papers/
│   └── {examId}/
│       └── {randomHash}-{timestamp}.pdf
└── answer-sheets/
    └── {examId}/
        └── {studentId}/
            └── {randomHash}-{timestamp}.pdf
```

### AWS S3 Storage

```
s3://skilldad-exams/
├── question-papers/
│   └── {examId}/
│       └── {randomHash}-{timestamp}.pdf
└── answer-sheets/
    └── {examId}/
        └── {studentId}/
            └── {randomHash}-{timestamp}.pdf
```

## Security Features

### 1. Randomized Filenames

Files are stored with cryptographically random names to prevent:
- Path traversal attacks
- Filename guessing
- Unauthorized access

Example: `a1b2c3d4e5f6...xyz-1234567890.pdf`

### 2. File Validation

All uploads are validated for:
- File type (MIME type)
- File extension
- File size limits

### 3. Access Control

- Time-based access for students (exam window)
- Enrollment verification
- Role-based permissions

### 4. Signed URLs

For S3 storage, pre-signed URLs provide:
- Time-limited access (default: 1 hour)
- No direct S3 access required
- Automatic expiration

## Usage Examples

### Frontend - Upload Question Paper

```javascript
// React component example
const uploadQuestionPaper = async (examId, file) => {
  const formData = new FormData();
  formData.append('questionPaper', file);

  try {
    const response = await fetch(`/api/exams/${examId}/question-paper`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('Upload successful:', data.data);
    } else {
      console.error('Upload failed:', data.message);
    }
  } catch (error) {
    console.error('Upload error:', error);
  }
};
```

### Frontend - Download Question Paper

```javascript
const downloadQuestionPaper = async (examId) => {
  try {
    const response = await fetch(
      `/api/exams/${examId}/question-paper/download`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );

    const data = await response.json();
    
    if (data.success) {
      // Open in new tab or download
      window.open(data.data.url, '_blank');
    } else {
      console.error('Download failed:', data.message);
    }
  } catch (error) {
    console.error('Download error:', error);
  }
};
```

### Frontend - Upload Answer Sheet with Progress

```javascript
const uploadAnswerSheet = async (examId, submissionId, file, onProgress) => {
  const formData = new FormData();
  formData.append('answerSheet', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload error')));

    xhr.open('POST', `/api/exams/${examId}/submissions/${submissionId}/answer-sheet`);
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('token')}`);
    xhr.send(formData);
  });
};

// Usage
uploadAnswerSheet(examId, submissionId, file, (progress) => {
  console.log(`Upload progress: ${progress.toFixed(2)}%`);
});
```

## Error Handling

### Common Error Responses

**File Too Large:**
```json
{
  "success": false,
  "message": "File size exceeds 10MB limit"
}
```

**Invalid File Type:**
```json
{
  "success": false,
  "message": "Only PDF files are allowed for question papers"
}
```

**Access Denied:**
```json
{
  "success": false,
  "message": "Exam has not started yet. Starts in 30 minute(s)",
  "availableAt": "2024-01-15T09:00:00Z"
}
```

**Not Enrolled:**
```json
{
  "success": false,
  "message": "You are not enrolled in this course"
}
```

## Testing

Run the test suite:

```bash
cd server
npm test -- FileUploadService.test.js
```

The test suite covers:
- File validation (type, size, extension)
- Filename generation (uniqueness, security)
- Edge cases (exact limits, boundary conditions)
- Security (path traversal prevention)

## Migration from Local to S3

To migrate from local storage to S3:

1. Set up AWS S3 bucket
2. Configure IAM permissions
3. Update environment variables:
   ```env
   FILE_STORAGE_TYPE=s3
   AWS_S3_BUCKET=your-bucket-name
   AWS_REGION=your-region
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   ```
4. Install AWS SDK (if not already installed):
   ```bash
   npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
   ```
5. Restart the server

The service will automatically use S3 for new uploads. Existing local files will remain accessible.

## Maintenance

### Cleanup Old Files

When an exam is deleted, all associated files are automatically removed:

```javascript
// Automatically called when exam is deleted
await FileUploadService.deleteExamFiles(examId);
```

### Replace Files

When uploading a new question paper or answer sheet, the old file is automatically deleted:

```javascript
// Old file is deleted before new upload
await FileUploadService.uploadQuestionPaper(file, examId);
```

## Troubleshooting

### Upload Fails with "No file provided"

- Ensure the form field name matches: `questionPaper` or `answerSheet`
- Check that `Content-Type: multipart/form-data` is set
- Verify the file is properly attached to FormData

### S3 Upload Fails

- Verify AWS credentials are correct
- Check IAM permissions include `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`
- Ensure bucket exists and region is correct
- Check bucket CORS configuration if uploading from browser

### Download URL Expired

- Signed URLs expire after 1 hour by default
- Generate a new URL by calling the download endpoint again
- Adjust `S3_SIGNED_URL_EXPIRY` environment variable if needed

## Support

For issues or questions:
1. Check the error message in the API response
2. Review server logs for detailed error information
3. Verify environment variables are correctly set
4. Ensure file meets validation requirements
