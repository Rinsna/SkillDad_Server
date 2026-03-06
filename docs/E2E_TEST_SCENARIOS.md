# End-to-End Test Scenarios - Exam Management System

## Overview

This document provides comprehensive end-to-end test scenarios for the Exam Management System. These scenarios cover the complete exam lifecycle from scheduling to result viewing, including all user roles and edge cases.

## Test Environment Setup

### Prerequisites
- MongoDB running locally or accessible
- Redis running (optional, for rate limiting and caching)
- Node.js server running on port 5000
- React client running on port 3000
- Test users created for each role:
  - Admin user
  - University user
  - Multiple student users (at least 3)
- Test course with enrolled students

### Test Data Setup

```javascript
// Create test users
const admin = { email: 'admin@test.com', password: 'Test123!', role: 'admin' };
const university = { email: 'university@test.com', password: 'Test123!', role: 'university' };
const student1 = { email: 'student1@test.com', password: 'Test123!', role: 'student' };
const student2 = { email: 'student2@test.com', password: 'Test123!', role: 'student' };
const student3 = { email: 'student3@test.com', password: 'Test123!', role: 'student' };

// Create test course
const course = {
  title: 'Data Structures and Algorithms',
  code: 'CS201',
  enrolledStudents: [student1._id, student2._id, student3._id]
};
```

---

## Scenario 1: Complete Online MCQ Exam Flow

**Objective**: Test the complete lifecycle of an online MCQ exam from scheduling to result viewing.

### Steps

#### 1.1 Admin Schedules Exam
**Actor**: Admin  
**Action**: Schedule a new online MCQ exam

1. Login as admin
2. Navigate to Exam Scheduler
3. Click "Schedule Exam"
4. Fill in exam details:
   - Title: "Midterm Exam - Data Structures"
   - Course: Select test course
   - University: Select test university
   - Exam Type: "Online MCQ"
   - Start Time: Current time + 2 minutes
   - End Time: Current time + 30 minutes
   - Duration: 20 minutes
   - Total Marks: 50
   - Passing Score: 40%
   - Mock Exam: No
5. Submit form

**Expected Results**:
- ✓ Exam created successfully
- ✓ Success toast notification displayed
- ✓ Exam appears in exam list with "SCHEDULED" status
- ✓ Enrolled students receive notification (check notification service logs)

#### 1.2 University Creates Questions
**Actor**: University  
**Action**: Add MCQ questions to the exam

1. Login as university user
2. Navigate to exam management
3. Select the created exam
4. Click "Add Questions"
5. Create 5 MCQ questions:
   - Question 1: 10 marks, 4 options, 1 correct
   - Question 2: 10 marks, 4 options, 1 correct, negative marks: 2
   - Question 3: 10 marks, 3 options, 1 correct
   - Question 4: 10 marks, 5 options, 1 correct
   - Question 5: 10 marks, 4 options, 1 correct
6. Save all questions

**Expected Results**:
- ✓ All 5 questions created successfully
- ✓ Questions appear in question list
- ✓ Total marks sum to 50
- ✓ Correct answers are marked properly

#### 1.3 Student Checks Exam Availability
**Actor**: Student 1  
**Action**: View upcoming exams

1. Login as student1
2. Navigate to "My Exams"
3. Locate the scheduled exam

**Expected Results**:
- ✓ Exam appears in exam list
- ✓ Status shows "UPCOMING"
- ✓ Countdown timer shows time until start
- ✓ "Start Exam" button is disabled
- ✓ Exam type badge shows "ONLINE MCQ"

#### 1.4 Wait for Exam Start Time
**Action**: Wait until exam start time arrives

**Expected Results**:
- ✓ Status changes to "ONGOING"
- ✓ "Start Exam" button becomes enabled
- ✓ Countdown shows time remaining

#### 1.5 Student Starts Exam
**Actor**: Student 1  
**Action**: Start the exam

1. Click "Start Exam" button
2. Confirm exam start

**Expected Results**:
- ✓ Redirected to exam taking page
- ✓ WebSocket connection established
- ✓ Timer starts counting down
- ✓ Questions are displayed (possibly shuffled if configured)
- ✓ MCQ options are displayed (possibly randomized)
- ✓ Submission record created with status "in-progress"
- ✓ Audit log entry created for exam start

#### 1.6 Student Answers Questions
**Actor**: Student 1  
**Action**: Answer all questions

1. Select option for Question 1 (correct answer)
2. Wait 2 seconds, verify auto-save
3. Select option for Question 2 (incorrect answer)
4. Select option for Question 3 (correct answer)
5. Select option for Question 4 (correct answer)
6. Select option for Question 5 (incorrect answer)

**Expected Results**:
- ✓ Each answer is auto-saved immediately
- ✓ Save status indicator shows "Saved"
- ✓ Answer changes are logged in audit system
- ✓ Timer continues counting down
- ✓ WebSocket sends time updates every minute

#### 1.7 Student Submits Exam
**Actor**: Student 1  
**Action**: Submit exam manually

1. Click "Submit Exam" button
2. Confirm submission in dialog

**Expected Results**:
- ✓ Submission confirmation dialog appears
- ✓ Exam is submitted successfully
- ✓ Redirected to submission confirmation page
- ✓ Submission status changed to "submitted"
- ✓ Auto-grading triggered for MCQ questions
- ✓ Marks calculated: (10 + 10 + 10) - 2 = 28/50
- ✓ Submission confirmation notification sent
- ✓ WebSocket disconnected
- ✓ Audit log entry created

#### 1.8 Student 2 Takes Exam (Auto-Submit Scenario)
**Actor**: Student 2  
**Action**: Start exam but don't submit manually

1. Login as student2
2. Start the exam
3. Answer 3 questions
4. Wait for exam time to expire

**Expected Results**:
- ✓ Exam auto-submitted when time expires
- ✓ WebSocket sends auto-submit event
- ✓ Submission status changed to "submitted"
- ✓ `isAutoSubmitted` flag set to true
- ✓ Auto-grading triggered
- ✓ Marks calculated based on answered questions
- ✓ Audit log entry created

#### 1.9 Student 3 Doesn't Take Exam
**Actor**: Student 3  
**Action**: Don't start the exam

**Expected Results**:
- ✓ No submission record created
- ✓ Exam status shows "ENDED" after end time

#### 1.10 University Views Submissions
**Actor**: University  
**Action**: View all submissions for grading

1. Login as university user
2. Navigate to exam grading interface
3. Select the exam
4. View submissions list

**Expected Results**:
- ✓ 2 submissions displayed (student1 and student2)
- ✓ Both submissions show status "graded" (auto-graded)
- ✓ Marks are displayed for each submission
- ✓ Student3 has no submission

#### 1.11 University Publishes Results
**Actor**: University  
**Action**: Publish exam results

1. Click "Publish Results" button
2. Confirm publication

**Expected Results**:
- ✓ Results published successfully
- ✓ Exam status changed to "published"
- ✓ Result publication timestamp recorded
- ✓ Notifications sent to students with results
- ✓ Audit log entry created

#### 1.12 Students View Results
**Actor**: Student 1 & Student 2  
**Action**: View exam results

1. Login as student
2. Navigate to "My Exams"
3. Click "View Result" for the exam

**Expected Results**:
- ✓ Result page displays:
  - Obtained marks / Total marks
  - Percentage
  - Grade (A+, A, B+, etc.)
  - Pass/Fail status
  - Rank among students
- ✓ Detailed answer breakdown available
- ✓ Correct answers shown for MCQ questions
- ✓ `viewedByStudent` flag set to true on first view
- ✓ Print/Download button available

---

## Scenario 2: PDF-Based Exam Flow

**Objective**: Test PDF-based exam with question paper upload and answer sheet submission.

### Steps

#### 2.1 Admin Schedules PDF Exam
**Actor**: Admin  
**Action**: Schedule PDF-based exam

1. Login as admin
2. Schedule exam with type "PDF-Based"
3. Set appropriate time window

**Expected Results**:
- ✓ Exam created with type "pdf-based"

#### 2.2 University Uploads Question Paper
**Actor**: University  
**Action**: Upload PDF question paper

1. Login as university
2. Navigate to exam
3. Click "Upload Question Paper"
4. Select valid PDF file (< 10MB)
5. Upload file

**Expected Results**:
- ✓ File uploaded successfully
- ✓ File stored with randomized filename
- ✓ `questionPaperUrl` updated in exam record
- ✓ Audit log entry created
- ✓ Rate limiter tracks upload (10/hour limit)

#### 2.3 Student Downloads Question Paper
**Actor**: Student  
**Action**: Start exam and download question paper

1. Login as student
2. Start exam when available
3. Click "Download Question Paper"

**Expected Results**:
- ✓ Signed URL generated with expiration
- ✓ PDF downloads successfully
- ✓ File is accessible

#### 2.4 Student Uploads Answer Sheet
**Actor**: Student  
**Action**: Upload answer sheet

1. Prepare answer sheet (PDF or image)
2. Click "Upload Answer Sheet"
3. Select file (< 20MB)
4. Upload file

**Expected Results**:
- ✓ File validated (type and size)
- ✓ File signature checked
- ✓ File uploaded successfully
- ✓ `answerSheetUrl` updated in submission
- ✓ Rate limiter tracks upload

#### 2.5 Student Submits Exam
**Actor**: Student  
**Action**: Submit exam

1. Click "Submit Exam"
2. Confirm submission

**Expected Results**:
- ✓ Submission recorded
- ✓ No auto-grading (PDF exam)
- ✓ Status remains "submitted"

#### 2.6 University Grades Submission
**Actor**: University  
**Action**: Manually grade PDF submission

1. Login as university
2. Navigate to grading interface
3. Select submission
4. Click "View Answer Sheet"
5. Enter marks for each question
6. Add feedback
7. Submit grading

**Expected Results**:
- ✓ Answer sheet opens in new tab
- ✓ Marks entered and validated
- ✓ Total marks calculated
- ✓ Percentage calculated
- ✓ Status changed to "graded"
- ✓ Result record created
- ✓ Audit log entry created

---

## Scenario 3: Mixed Exam (MCQ + Descriptive)

**Objective**: Test exam with both MCQ and descriptive questions.

### Steps

#### 3.1 Create Mixed Exam
**Actor**: Admin & University  
**Action**: Create exam with mixed questions

1. Admin schedules exam with type "Mixed"
2. University adds:
   - 3 MCQ questions (10 marks each)
   - 2 Descriptive questions (15 marks each)
   - Total: 60 marks

**Expected Results**:
- ✓ Both question types created
- ✓ Total marks = 60

#### 3.2 Student Takes Exam
**Actor**: Student  
**Action**: Answer both types of questions

1. Start exam
2. Answer MCQ questions (select options)
3. Answer descriptive questions (type text, max 10,000 chars)
4. Submit exam

**Expected Results**:
- ✓ MCQ answers saved with `selectedOption`
- ✓ Descriptive answers saved with `textAnswer`
- ✓ Auto-grading applied to MCQ only
- ✓ Status remains "submitted" (pending manual grading)

#### 3.3 University Grades Descriptive Questions
**Actor**: University  
**Action**: Grade descriptive answers

1. View submission
2. Review descriptive answers
3. Enter marks for each descriptive question
4. Add feedback
5. Submit grading

**Expected Results**:
- ✓ MCQ marks already calculated
- ✓ Descriptive marks added
- ✓ Total marks = MCQ marks + Descriptive marks
- ✓ Status changed to "graded"
- ✓ Result generated

---

## Scenario 4: WebSocket Real-Time Features

**Objective**: Test WebSocket timer, warnings, and auto-submission.

### Steps

#### 4.1 Test Timer Updates
**Actor**: Student  
**Action**: Monitor timer during exam

1. Start exam with 10-minute duration
2. Observe timer updates

**Expected Results**:
- ✓ Timer displays correctly
- ✓ WebSocket sends updates every minute
- ✓ Timer counts down accurately
- ✓ Connection status indicator shows "Connected"

#### 4.2 Test Warning Notifications
**Actor**: Student  
**Action**: Wait for warning notifications

1. Continue exam
2. Wait until 5 minutes remaining
3. Wait until 1 minute remaining

**Expected Results**:
- ✓ Warning notification at 5 minutes
- ✓ Warning notification at 1 minute
- ✓ Notifications displayed prominently

#### 4.3 Test WebSocket Reconnection
**Actor**: Student  
**Action**: Simulate connection loss

1. During exam, disable network briefly
2. Re-enable network

**Expected Results**:
- ✓ Connection status shows "Disconnected"
- ✓ Automatic reconnection attempted
- ✓ Exponential backoff applied
- ✓ Connection restored
- ✓ Timer synced after reconnection
- ✓ Answers continue to save via HTTP fallback

#### 4.4 Test Auto-Submission
**Actor**: Student  
**Action**: Let exam time expire

1. Start exam
2. Answer some questions
3. Wait for time to expire

**Expected Results**:
- ✓ Auto-submit event received via WebSocket
- ✓ Exam submitted automatically
- ✓ `isAutoSubmitted` flag set to true
- ✓ Notification displayed
- ✓ Redirected to confirmation page

---

## Scenario 5: Access Control and Security

**Objective**: Test exam access control, rate limiting, and security measures.

### Steps

#### 5.1 Test Time-Based Access Control
**Actor**: Student  
**Action**: Attempt to access exam at different times

1. Try to start exam before start time
2. Try to start exam during valid window
3. Try to start exam after end time

**Expected Results**:
- ✓ Before start: Access denied, shows countdown
- ✓ During window: Access granted
- ✓ After end: Access denied, shows "Ended"
- ✓ All attempts logged in audit system

#### 5.2 Test Enrollment Verification
**Actor**: Non-enrolled student  
**Action**: Try to access exam

1. Login as student not enrolled in course
2. Try to start exam

**Expected Results**:
- ✓ Access denied
- ✓ Error message: "Not enrolled in course"
- ✓ Audit log entry created

#### 5.3 Test Duplicate Submission Prevention
**Actor**: Student  
**Action**: Try to start exam twice

1. Start exam
2. Submit exam
3. Try to start exam again

**Expected Results**:
- ✓ Second start attempt denied
- ✓ Error message: "Already submitted"
- ✓ Unique constraint enforced

#### 5.4 Test Rate Limiting
**Actor**: Student  
**Action**: Trigger rate limits

1. Make 61 answer submissions in 1 minute
2. Try to upload 11 files in 1 hour
3. Try to start exam 4 times in 1 day

**Expected Results**:
- ✓ 61st answer submission blocked (60/min limit)
- ✓ 11th file upload blocked (10/hour limit)
- ✓ 4th exam start blocked (3/exam/day limit)
- ✓ 429 status code returned
- ✓ `Retry-After` header included

#### 5.5 Test Input Validation
**Actor**: Admin  
**Action**: Submit invalid exam data

1. Try to create exam with:
   - End time before start time
   - Duration exceeding time window
   - Invalid exam type
   - Negative marks
   - XSS payload in title

**Expected Results**:
- ✓ All invalid inputs rejected
- ✓ 400 status code returned
- ✓ Descriptive error messages
- ✓ XSS payload sanitized

#### 5.6 Test File Upload Security
**Actor**: University  
**Action**: Upload malicious files

1. Try to upload .exe file as question paper
2. Try to upload file > 10MB
3. Try to upload fake PDF (wrong signature)
4. Try to upload file with path traversal name

**Expected Results**:
- ✓ .exe file rejected (invalid type)
- ✓ Large file rejected (size limit)
- ✓ Fake PDF rejected (signature validation)
- ✓ Malicious filename sanitized
- ✓ All attempts logged

---

## Scenario 6: Mock Exam Flow

**Objective**: Test mock exam functionality.

### Steps

#### 6.1 Create Mock Exam
**Actor**: Admin  
**Action**: Schedule mock exam

1. Schedule exam with "Mock Exam" = Yes
2. Add questions
3. Publish exam

**Expected Results**:
- ✓ `isMockExam` flag set to true
- ✓ "MOCK EXAM" label in admin list
- ✓ "Mock" badge in student list

#### 6.2 Student Takes Mock Exam
**Actor**: Student  
**Action**: Take mock exam

1. Start mock exam
2. Answer questions
3. Submit

**Expected Results**:
- ✓ Same process as regular exam
- ✓ Time limits enforced
- ✓ Auto-submission works
- ✓ Grading works identically

#### 6.3 View Mock Exam Results
**Actor**: Student  
**Action**: View results

1. Navigate to results
2. View mock exam result

**Expected Results**:
- ✓ "Mock Exam" badge displayed
- ✓ All result details shown
- ✓ Results identical to regular exams

---

## Scenario 7: Exam Integrity and Monitoring

**Objective**: Test exam integrity features and suspicious activity detection.

### Steps

#### 7.1 Test Question Shuffling
**Actor**: Student 1 & Student 2  
**Action**: Start exam with shuffling enabled

1. Admin enables `shuffleQuestions` for exam
2. Student1 starts exam, note question order
3. Student2 starts exam, note question order

**Expected Results**:
- ✓ Question order different for each student
- ✓ All questions present for both students

#### 7.2 Test MCQ Option Randomization
**Actor**: Student  
**Action**: View MCQ questions

1. Start exam
2. View MCQ questions

**Expected Results**:
- ✓ Options displayed in random order
- ✓ Correct answer tracking maintained
- ✓ Option mapping stored server-side only

#### 7.3 Test Answer Change Tracking
**Actor**: Student  
**Action**: Change answers multiple times

1. Start exam
2. Select option A for Question 1
3. Wait 2 seconds
4. Change to option B
5. Wait 2 seconds
6. Change to option C
7. Submit exam

**Expected Results**:
- ✓ All changes logged in audit system
- ✓ Timestamps recorded for each change
- ✓ Changes stored in `submission.answerChanges`

#### 7.4 Test Suspicious Activity Detection
**Actor**: Student  
**Action**: Trigger suspicious activity flags

1. Change same answer 6 times rapidly
2. Complete exam in 30 seconds (10 questions)

**Expected Results**:
- ✓ "Excessive changes" flag raised
- ✓ "Fast completion" flag raised
- ✓ Flags available for review
- ✓ No automatic penalties (manual review)

---

## Scenario 8: Performance and Scalability

**Objective**: Test system performance with multiple concurrent users.

### Steps

#### 8.1 Test Concurrent Exam Taking
**Action**: Simulate 50 students taking exam simultaneously

1. Create 50 test student accounts
2. Enroll all in course
3. Schedule exam
4. Have all 50 students start exam at same time
5. Monitor WebSocket connections
6. Monitor database performance

**Expected Results**:
- ✓ All students can start exam
- ✓ WebSocket rooms handle all connections
- ✓ Timer updates broadcast efficiently
- ✓ Answer submissions processed quickly
- ✓ No connection drops
- ✓ Database indexes used effectively

#### 8.2 Test Auto-Submission at Scale
**Action**: Auto-submit 50 exams simultaneously

1. Wait for exam time to expire
2. Monitor auto-submission process

**Expected Results**:
- ✓ All 50 submissions auto-submitted
- ✓ Auto-grading completes for all
- ✓ No timeouts or errors
- ✓ Audit logs created for all

#### 8.3 Test Caching
**Action**: Test exam details caching

1. Enable Redis caching
2. Load exam details 100 times
3. Monitor cache hits/misses

**Expected Results**:
- ✓ First request caches exam details
- ✓ Subsequent requests served from cache
- ✓ Cache invalidated on exam update
- ✓ 5-minute TTL respected

---

## Scenario 9: Error Handling and Recovery

**Objective**: Test error handling and data recovery.

### Steps

#### 9.1 Test Network Interruption During Exam
**Actor**: Student  
**Action**: Simulate network issues

1. Start exam
2. Answer 3 questions
3. Disable network for 30 seconds
4. Re-enable network

**Expected Results**:
- ✓ Answers saved before interruption
- ✓ HTTP fallback used during interruption
- ✓ WebSocket reconnects automatically
- ✓ No data loss
- ✓ Timer syncs after reconnection

#### 9.2 Test File Upload Failure Recovery
**Actor**: Student  
**Action**: Simulate upload failure

1. Start PDF exam
2. Try to upload answer sheet
3. Simulate network error during upload
4. Retry upload

**Expected Results**:
- ✓ Error message displayed
- ✓ Retry option available
- ✓ Other form data preserved
- ✓ Second upload succeeds

#### 9.3 Test Database Connection Loss
**Action**: Simulate database disconnection

1. Stop MongoDB during exam
2. Try to submit answer
3. Restart MongoDB
4. Retry submission

**Expected Results**:
- ✓ Error handled gracefully
- ✓ User-friendly error message
- ✓ Retry mechanism available
- ✓ Data consistency maintained

---

## Scenario 10: Complete Exam Lifecycle (All Roles)

**Objective**: Test complete workflow with all user roles interacting.

### Timeline

**Day 1 - Exam Preparation**
1. Admin schedules exam (10:00 AM)
2. University uploads question paper OR creates questions (11:00 AM)
3. Students receive notification (11:00 AM)

**Day 2 - Exam Day**
4. Students check exam availability (9:00 AM)
5. Exam starts (10:00 AM)
6. Student1 starts exam (10:00 AM)
7. Student2 starts exam (10:05 AM)
8. Student3 starts exam (10:10 AM)
9. Student1 submits manually (10:15 AM)
10. Student2 auto-submitted (10:30 AM - time expired)
11. Student3 still taking exam (10:25 AM)
12. Student3 submits manually (10:28 AM)
13. Exam ends (10:30 AM)

**Day 3 - Grading**
14. University views submissions (9:00 AM)
15. Auto-grading completed for MCQ (automatic)
16. University grades descriptive questions (9:30 AM)
17. University publishes results (10:00 AM)
18. Students receive result notifications (10:00 AM)

**Day 3 - Results**
19. Students view results (10:05 AM)
20. Students download results (10:10 AM)

**Expected Results**:
- ✓ Complete workflow executes smoothly
- ✓ All notifications sent at correct times
- ✓ All audit logs created
- ✓ All data consistent across system
- ✓ No errors or data loss

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] MongoDB running and accessible
- [ ] Redis running (optional)
- [ ] Server running on port 5000
- [ ] Client running on port 3000
- [ ] Test users created (admin, university, 3+ students)
- [ ] Test course created with enrolled students
- [ ] Environment variables configured
- [ ] File storage configured (local or S3)

### During Testing
- [ ] Monitor server logs for errors
- [ ] Monitor WebSocket connections
- [ ] Monitor database queries
- [ ] Monitor network requests
- [ ] Check audit logs
- [ ] Verify notifications sent
- [ ] Check file uploads/downloads

### Post-Test Verification
- [ ] All submissions recorded correctly
- [ ] All results calculated accurately
- [ ] All audit logs present
- [ ] No orphaned files
- [ ] No memory leaks
- [ ] Database indexes used
- [ ] Cache working correctly
- [ ] Rate limits enforced

---

## Known Issues and Limitations

### Current Limitations
1. WebSocket scaling requires Redis adapter for multi-server deployment
2. File storage limited to local filesystem or S3 (no other providers)
3. Notification service requires email configuration
4. Property-based tests not implemented (optional tasks)

### Performance Considerations
1. Large file uploads (>10MB) may be slow on poor connections
2. Auto-grading 1000+ submissions may take several seconds
3. WebSocket connections limited by server resources
4. Database queries may slow down with 10,000+ exams

---

## Conclusion

These end-to-end test scenarios provide comprehensive coverage of the Exam Management System. Execute these scenarios in a test environment before deploying to production. Document any failures or unexpected behavior for debugging and improvement.

For automated testing, consider implementing these scenarios using tools like:
- **Backend**: Jest + Supertest for API testing
- **Frontend**: Cypress or Playwright for E2E testing
- **Load Testing**: Artillery or k6 for performance testing
- **WebSocket**: Socket.IO client for connection testing
