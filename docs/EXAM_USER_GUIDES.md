# Exam Management System - User Guides

## Overview

This document provides comprehensive user guides for all roles in the Exam Management System: Admin, University, and Student. Each guide includes step-by-step instructions with screenshots references and best practices.

---

## Table of Contents

1. [Admin Guide](#admin-guide)
2. [University Guide](#university-guide)
3. [Student Guide](#student-guide)
4. [Common Tasks](#common-tasks)
5. [Troubleshooting](#troubleshooting)
6. [FAQ](#faq)

---

# Admin Guide

## Role Overview

As an Admin, you have full control over the exam system. Your responsibilities include:
- Scheduling exams for all universities and courses
- Managing exam configurations
- Monitoring system-wide exam activities
- Viewing all exam results and statistics
- Managing exam lifecycle (update, delete)

## Getting Started

### 1. Accessing the Admin Panel

1. Log in to the system with your admin credentials
2. Navigate to the **Admin Dashboard**
3. Click on **Exam Management** in the sidebar

### 2. Dashboard Overview

The admin dashboard displays:
- Total scheduled exams
- Active exams (currently ongoing)
- Completed exams awaiting grading
- Published results
- Quick actions menu

---

## Scheduling an Exam

### Step-by-Step Process

**Step 1: Navigate to Schedule Exam**
1. Click **Exam Management** → **Schedule New Exam**
2. The exam scheduling form will appear

**Step 2: Fill Basic Information**
- **Exam Title**: Enter a descriptive title (e.g., "Midterm Examination - Spring 2024")
- **Description**: Add optional details about the exam
- **University**: Select the university conducting the exam
- **Course**: Select the course for which the exam is scheduled

**Step 3: Configure Exam Type**

Choose one of four exam types:


1. **PDF-Based**: Students download question paper and upload answer sheets
2. **Online MCQ**: Multiple choice questions answered online
3. **Online Descriptive**: Essay/descriptive questions answered online
4. **Mixed**: Combination of MCQ and descriptive questions

**Step 4: Set Scheduling Details**
- **Scheduled Start Time**: When students can begin the exam
- **Scheduled End Time**: Last time students can start the exam
- **Duration**: Time allowed to complete exam (in minutes)
- **Allow Late Submission**: Enable if students can submit after end time
- **Late Submission Deadline**: If enabled, set the final deadline

**Important Validation Rules:**
- End time must be after start time
- Duration must fit within the time window
- Late submission deadline must be after end time

**Step 5: Configure Exam Settings**
- **Total Marks**: Maximum marks for the exam
- **Passing Score**: Minimum percentage to pass (0-100)
- **Mock Exam**: Check if this is a practice exam
- **Shuffle Questions**: Randomize question order for each student
- **Show Results Immediately**: Display results right after grading

**Step 6: Add Instructions**
- Enter exam instructions for students
- Include any special rules or requirements
- Mention allowed materials or restrictions

**Step 7: Review and Submit**
1. Review all entered information
2. Click **Schedule Exam**
3. System will validate all fields
4. On success, enrolled students receive notifications

### Best Practices

✅ **DO:**
- Schedule exams at least 24 hours in advance
- Provide clear, detailed instructions
- Set realistic duration based on question count
- Enable late submission for flexibility
- Use mock exams for practice before real exams

❌ **DON'T:**
- Schedule overlapping exams for the same course
- Set duration longer than the time window
- Forget to notify students about exam changes
- Schedule exams during holidays or breaks

---

## Managing Scheduled Exams

### Viewing All Exams

1. Navigate to **Exam Management** → **All Exams**
2. Use filters to find specific exams:
   - **Status**: Scheduled, Ongoing, Completed, Graded, Published
   - **University**: Filter by institution
   - **Course**: Filter by course
   - **Mock Exam**: Show only practice exams

### Updating an Exam

**Before Exam Starts:**
1. Find the exam in the list
2. Click **Edit** button
3. Modify any field (all validations still apply)
4. Click **Update Exam**
5. Students receive update notifications

**After Exam Starts:**
- Cannot modify scheduling or configuration
- Can only update description or instructions

### Deleting an Exam

**Warning:** Deletion is permanent and removes all associated data!

1. Find the exam in the list
2. Click **Delete** button
3. Confirm deletion in the popup
4. System deletes:
   - Exam record
   - All questions
   - All submissions
   - All results
   - Uploaded files (question papers, answer sheets)

**When to Delete:**
- Exam was scheduled by mistake
- Exam needs to be completely rescheduled
- Course was cancelled

---

## Monitoring Active Exams

### Real-Time Dashboard

1. Navigate to **Active Exams** tab
2. View live statistics:
   - Number of students currently taking exam
   - Submissions received
   - Time remaining
   - Auto-submission countdown

### Exam Status Lifecycle

```
Scheduled → Ongoing → Completed → Graded → Published
```

- **Scheduled**: Exam is created, waiting for start time
- **Ongoing**: Exam is currently active, students can take it
- **Completed**: Exam time expired, all submissions received
- **Graded**: All submissions have been graded
- **Published**: Results are visible to students

---

## Viewing Results and Statistics

### Accessing Exam Results

1. Navigate to **Exam Management** → **Results**
2. Select an exam from the list
3. View comprehensive statistics:
   - Total students
   - Average score
   - Pass rate
   - Grade distribution
   - Highest/lowest scores

### Exporting Results

1. Click **Export Results** button
2. Choose format:
   - **CSV**: For spreadsheet analysis
   - **PDF**: For printing/archiving
   - **Excel**: For advanced analysis
3. File downloads automatically

### Individual Student Results

1. In the results view, click on a student name
2. View detailed breakdown:
   - Question-wise performance
   - Time spent
   - Submission timestamp
   - Grading feedback

---

# University Guide

## Role Overview

As a University user, you manage exam content and grading. Your responsibilities include:
- Creating exam questions (for online exams)
- Uploading question papers (for PDF exams)
- Grading student submissions
- Publishing results
- Viewing course-specific exam statistics

## Getting Started

### Accessing Your Exams

1. Log in with your university credentials
2. Navigate to **My Exams** in the sidebar
3. View exams scheduled for your university

---

## Creating Exam Content

### For PDF-Based Exams

**Step 1: Prepare Question Paper**
- Create PDF with all questions
- Ensure file size is under 10MB
- Use clear formatting and numbering
- Include answer space indicators if needed

**Step 2: Upload Question Paper**
1. Find the exam in your list
2. Click **Upload Question Paper**
3. Select PDF file from your computer
4. Click **Upload**
5. Wait for upload confirmation
6. Preview uploaded file to verify

**Replacing Question Paper:**
- Upload a new file to replace the existing one
- Old file is automatically deleted
- Students see the latest version

### For Online Exams (MCQ)

**Step 1: Access Question Builder**
1. Find the exam in your list
2. Click **Create Questions**
3. Question builder interface opens

**Step 2: Add MCQ Questions**
1. Click **Add MCQ Question**
2. Fill in the form:
   - **Question Text**: Enter the question
   - **Options**: Add at least 2 options (up to 6)
   - **Correct Answer**: Mark one option as correct
   - **Marks**: Points for correct answer
   - **Negative Marks**: Points deducted for wrong answer (optional)
   - **Order**: Question sequence number

3. Click **Add Question**
4. Question appears in the list

**Step 3: Review and Save**
1. Review all questions in the list
2. Edit or delete questions as needed
3. Click **Save All Questions**
4. Confirmation message appears

**Best Practices for MCQ:**
- Write clear, unambiguous questions
- Ensure only one correct answer
- Make distractors plausible but incorrect
- Use consistent formatting
- Avoid "all of the above" or "none of the above"

### For Online Exams (Descriptive)

**Step 1: Add Descriptive Questions**
1. Click **Add Descriptive Question**
2. Fill in the form:
   - **Question Text**: Enter the question
   - **Marks**: Maximum points
   - **Order**: Question sequence number
   - **Expected Answer Length**: Guide for students (optional)

3. Click **Add Question**

**Best Practices for Descriptive:**
- Provide clear evaluation criteria
- Specify expected answer length
- Include any required format (essay, bullet points, etc.)
- Allocate appropriate marks based on complexity

### For Mixed Exams

1. Add both MCQ and descriptive questions
2. System handles auto-grading for MCQ
3. You manually grade descriptive questions
4. Final score combines both types

---

## Grading Submissions

### Auto-Grading (MCQ Only)

**Automatic Process:**
- MCQ questions are graded automatically when submitted
- System compares selected option with correct answer
- Awards full marks for correct, applies negative marks for incorrect
- Calculates total score and percentage

**Manual Trigger:**
1. Navigate to **Grading** → **Auto-Grade**
2. Select exam
3. Click **Run Auto-Grading**
4. View grading summary

### Manual Grading (Descriptive Questions)

**Step 1: Access Grading Queue**
1. Navigate to **Grading** → **Pending Submissions**
2. Filter by course or exam
3. View list of submissions awaiting grading

**Step 2: Select Submission**
1. Click on a student's submission
2. View all questions and student answers
3. For PDF exams, download answer sheet

**Step 3: Grade Each Question**
1. Read the student's answer
2. Enter **Marks Awarded** (0 to maximum marks)
3. Add **Feedback** (optional but recommended)
4. Move to next question

**Step 4: Add Overall Feedback**
- Provide general comments on performance
- Highlight strengths and areas for improvement
- Offer constructive suggestions

**Step 5: Submit Grading**
1. Review all marks awarded
2. Click **Submit Grading**
3. System calculates:
   - Total obtained marks
   - Percentage
   - Grade (A+, A, B+, etc.)
   - Pass/Fail status
4. Result is created but not yet published

**Grading Best Practices:**
- Use a rubric for consistency
- Provide specific, actionable feedback
- Grade all submissions for one question before moving to next
- Take breaks to maintain objectivity
- Double-check marks before submitting

---

## Publishing Results

### Pre-Publication Checklist

Before publishing results, ensure:
- ✅ All submissions are graded
- ✅ Marks are verified and accurate
- ✅ Feedback is appropriate and helpful
- ✅ Grade distribution looks reasonable

### Publishing Process

**Step 1: Generate Results**
1. Navigate to **Results** → **Generate Results**
2. Select the exam
3. Click **Generate Results**
4. System calculates:
   - Rankings (with tie handling)
   - Grade distribution
   - Statistics

**Step 2: Review Results**
1. View generated results
2. Check for anomalies:
   - Unusually high/low scores
   - Unexpected grade distribution
   - Ranking issues
3. Make corrections if needed (re-grade specific submissions)

**Step 3: Publish Results**
1. Click **Publish Results**
2. Confirm publication in popup
3. System:
   - Sets results as published
   - Sends notifications to all students
   - Makes results visible in student portal

**Important Notes:**
- Publication is irreversible (results become visible immediately)
- Students receive email notifications
- Results include detailed breakdown if configured

---

## Viewing Statistics and Analytics

### Exam Performance Dashboard

1. Navigate to **Analytics** → **Exam Performance**
2. Select exam
3. View comprehensive analytics:
   - Score distribution histogram
   - Question-wise difficulty analysis
   - Time spent analysis
   - Completion rates

### Question Analysis

- **Difficulty Index**: Percentage of students who answered correctly
- **Discrimination Index**: How well question separates high/low performers
- **Distractor Analysis**: For MCQ, which wrong options were chosen

### Using Analytics for Improvement

- Identify questions that were too easy/hard
- Spot confusing questions (low discrimination)
- Adjust future exams based on insights
- Provide targeted feedback to students

---

# Student Guide

## Role Overview

As a Student, you can:
- View scheduled exams for your enrolled courses
- Take exams during the scheduled time window
- Submit answers (online or upload answer sheets)
- View published results with detailed feedback

## Getting Started

### Accessing Your Exams

1. Log in with your student credentials
2. Navigate to **My Exams** in the sidebar
3. View all exams for courses you're enrolled in

### Exam Dashboard

Your dashboard shows:
- **Upcoming Exams**: Scheduled but not yet started
- **Active Exams**: Currently available to take
- **Completed Exams**: Submitted, awaiting results
- **Results Available**: Published results you can view

---

## Taking an Exam

### Before the Exam

**Preparation Checklist:**
- ✅ Check exam date, time, and duration
- ✅ Read exam instructions carefully
- ✅ Ensure stable internet connection
- ✅ Prepare required materials (if allowed)
- ✅ Find a quiet, distraction-free environment
- ✅ For PDF exams, have answer sheet ready
- ✅ Close unnecessary browser tabs/applications

### Starting the Exam

**Step 1: Check Access**
1. Navigate to **My Exams**
2. Find the exam in the list
3. Check status:
   - **Not Started**: Shows countdown to start time
   - **Available**: Green "Start Exam" button appears
   - **Ended**: Exam time window has passed

**Step 2: Start Exam**
1. Click **Start Exam** button
2. System checks:
   - Current time is within exam window
   - You're enrolled in the course
   - You haven't already submitted
3. Exam interface loads
4. Timer starts automatically

### Taking Online MCQ Exam

**Interface Overview:**
- Question panel (left): Shows all questions
- Answer panel (right): Current question and options
- Timer (top): Countdown with warnings
- Navigation (bottom): Previous/Next buttons
- Submit button (bottom right)

**Answering Questions:**
1. Read question carefully
2. Select one option by clicking radio button
3. Answer is auto-saved immediately
4. Green checkmark indicates saved answer
5. Navigate to next question

**Navigation:**
- Click question numbers to jump to specific questions
- Use Previous/Next buttons to move sequentially
- Unanswered questions shown in gray
- Answered questions shown in green

**Timer Warnings:**
- **5 minutes remaining**: Yellow warning appears
- **1 minute remaining**: Red warning appears
- **Time expired**: Exam auto-submits

### Taking Online Descriptive Exam

**Answering Questions:**
1. Read question carefully
2. Type answer in text area
3. Answer auto-saves every 30 seconds
4. Character counter shows remaining space (max 10,000 chars)
5. Use formatting if available (bold, italic, lists)

**Tips for Descriptive Answers:**
- Structure your answer with introduction, body, conclusion
- Use paragraphs for readability
- Include examples where appropriate
- Proofread before moving to next question

### Taking PDF-Based Exam

**Step 1: Download Question Paper**
1. Click **Download Question Paper** button
2. PDF opens in new tab or downloads
3. Read all questions carefully

**Step 2: Prepare Answers**
- Write answers on paper or type in document
- Follow any formatting instructions
- Include question numbers clearly

**Step 3: Upload Answer Sheet**
1. Scan or photograph your answers
2. Ensure file is clear and readable
3. Convert to PDF or keep as image (JPG, PNG)
4. File size must be under 20MB
5. Click **Upload Answer Sheet**
6. Select file from computer
7. Wait for upload confirmation
8. Preview uploaded file to verify

**Step 4: Submit Exam**
1. Verify answer sheet is uploaded
2. Click **Submit Exam**
3. Confirm submission in popup

---

## During the Exam

### Auto-Save Feature

- All answers are automatically saved
- No need to manually save
- Green checkmark confirms save
- If connection drops, answers are preserved locally
- Reconnection syncs saved answers

### Time Management

**Timer Display:**
- Shows hours:minutes:seconds remaining
- Updates every second
- Color changes as time runs low:
  - Green: More than 5 minutes
  - Yellow: 5 minutes or less
  - Red: 1 minute or less

**Time Management Tips:**
- Allocate time per question based on marks
- Answer easy questions first
- Mark difficult questions for review
- Keep track of time regularly
- Leave time for final review

### Handling Technical Issues

**Connection Lost:**
1. Don't panic - answers are saved locally
2. Check your internet connection
3. System attempts automatic reconnection
4. Once reconnected, answers sync automatically

**Browser Crash:**
1. Reopen browser immediately
2. Navigate back to exam
3. Click **Resume Exam**
4. All saved answers are restored
5. Timer continues from where it stopped

**Can't Submit:**
1. Check internet connection
2. Try refreshing the page
3. Answers are still saved
4. Contact support if issue persists
5. Exam auto-submits at time expiry

---

## Submitting the Exam

### Manual Submission

**Step 1: Review Answers**
1. Click **Review** button
2. See summary of all questions
3. Unanswered questions highlighted in red
4. Click question to go back and answer

**Step 2: Final Check**
- Ensure all questions are answered
- Review flagged questions
- Check for any errors or typos

**Step 3: Submit**
1. Click **Submit Exam** button
2. Confirmation popup appears
3. Review submission details:
   - Questions answered
   - Time spent
   - Submission timestamp
4. Click **Confirm Submission**
5. Success message appears
6. Confirmation email sent

### Auto-Submission

**When Time Expires:**
- System automatically submits your exam
- All saved answers are included
- Notification appears on screen
- Email confirmation sent
- No action needed from you

**After Auto-Submission:**
- You're redirected to confirmation page
- Can view submission summary
- Cannot modify answers
- Results available after grading

---

## Viewing Results

### Checking Result Status

1. Navigate to **My Exams** → **Results**
2. Check status for each exam:
   - **Grading in Progress**: Not yet available
   - **Results Published**: Click to view

### Viewing Detailed Results

**Result Summary:**
- Total marks and obtained marks
- Percentage score
- Grade (A+, A, B+, B, C, D, F)
- Pass/Fail status
- Your rank in the class
- Class average for comparison

**Question-Wise Breakdown:**
1. Click **View Detailed Results**
2. See each question with:
   - Your answer
   - Correct answer (for MCQ)
   - Marks awarded
   - Feedback from grader
3. Understand where you lost marks

**For MCQ:**
- Correct answers shown in green
- Incorrect answers shown in red
- Correct option highlighted

**For Descriptive:**
- Your answer displayed
- Marks awarded out of maximum
- Detailed feedback from grader
- Suggestions for improvement

### Downloading Results

1. Click **Download Result** button
2. Choose format:
   - **PDF**: For printing
   - **Email**: Send to your email
3. File downloads or email sent

---

## Best Practices for Students

### Before Exam

✅ **Preparation:**
- Study course material thoroughly
- Take practice/mock exams if available
- Familiarize yourself with exam interface
- Test your internet connection
- Prepare backup internet (mobile hotspot)

✅ **Technical Setup:**
- Use updated browser (Chrome, Firefox, Edge)
- Clear browser cache
- Disable browser extensions
- Close unnecessary applications
- Charge laptop fully or keep plugged in

### During Exam

✅ **DO:**
- Read instructions carefully
- Manage time wisely
- Answer all questions
- Review before submitting
- Stay calm if technical issues occur

❌ **DON'T:**
- Refresh page unnecessarily
- Open multiple tabs
- Use unauthorized materials (if prohibited)
- Share exam content
- Attempt to cheat (system logs all activities)

### After Exam

✅ **Follow-Up:**
- Check email for confirmation
- Note any technical issues experienced
- Review results when published
- Learn from feedback
- Contact instructor for clarifications

---

# Common Tasks

## Changing Exam Schedule

**Admin Only:**
1. Find exam in list
2. Click **Edit**
3. Update start/end times
4. Ensure duration still fits
5. Save changes
6. Students notified automatically

## Handling Late Submissions

**Admin/University:**
1. Enable "Allow Late Submission" when scheduling
2. Set late submission deadline
3. Students can submit until deadline
4. Late submissions flagged in system

## Dealing with Technical Issues During Exam

**For Students:**
1. Don't panic - answers are saved
2. Try refreshing browser
3. Check internet connection
4. Contact support via chat
5. Document issue with screenshots

**For Admin/University:**
1. Monitor active exams dashboard
2. Check for widespread issues
3. Extend exam time if needed
4. Communicate with affected students
5. Review logs for troubleshooting

## Regrading a Submission

**University Only:**
1. Navigate to graded submissions
2. Find student's submission
3. Click **Regrade**
4. Modify marks and feedback
5. Save changes
6. Result automatically updated
7. Student notified of change

---

# Troubleshooting

## Common Issues and Solutions

### Issue: Cannot Start Exam

**Possible Causes:**
- Exam hasn't started yet
- Exam time window has passed
- Not enrolled in course
- Already submitted exam

**Solutions:**
1. Check current time vs exam schedule
2. Verify course enrollment
3. Contact admin if enrolled but can't access
4. Check for existing submission

### Issue: Timer Not Updating

**Possible Causes:**
- JavaScript disabled
- Browser compatibility issue
- WebSocket connection failed

**Solutions:**
1. Enable JavaScript in browser
2. Use supported browser (Chrome, Firefox, Edge)
3. Check firewall/antivirus settings
4. Refresh page
5. Timer fallback uses HTTP polling

### Issue: Answer Not Saving

**Possible Causes:**
- Internet connection lost
- Server error
- Browser storage full

**Solutions:**
1. Check internet connection
2. Look for save confirmation (green checkmark)
3. Try answering again
4. Clear browser cache
5. Contact support if persists

### Issue: Cannot Upload File

**Possible Causes:**
- File too large
- Wrong file format
- Network issue

**Solutions:**
1. Check file size (PDF: 10MB, Answer Sheet: 20MB)
2. Verify file format (PDF or image)
3. Compress file if too large
4. Try different network
5. Use wired connection if available

### Issue: Results Not Showing

**Possible Causes:**
- Results not yet published
- Grading still in progress
- Browser cache issue

**Solutions:**
1. Check with instructor about publication
2. Wait for grading completion
3. Clear browser cache and refresh
4. Try different browser
5. Contact support if published but not visible

---

# FAQ

## For Students

**Q: Can I take the exam on mobile device?**
A: Yes, but desktop/laptop is recommended for better experience, especially for descriptive questions and file uploads.

**Q: What happens if my internet disconnects during exam?**
A: Your answers are saved locally. When reconnected, they sync automatically. Timer continues running.

**Q: Can I go back and change answers?**
A: Yes, until you submit the exam. After submission, no changes allowed.

**Q: How long do I have to wait for results?**
A: Depends on exam type. MCQ results are immediate after auto-grading. Descriptive exams require manual grading (typically 3-7 days).

**Q: Can I download my answer sheet after submission?**
A: Yes, you can view and download your submission from the exam history.

**Q: What if I accidentally submit early?**
A: Submission is final. Contact your instructor immediately if this happens.

## For University Users

**Q: Can I edit questions after exam starts?**
A: No, questions are locked once exam begins to ensure fairness.

**Q: How do I handle suspected cheating?**
A: System logs all activities. Review submission timestamps, answer patterns, and flag suspicious submissions for admin review.

**Q: Can I extend exam time for a specific student?**
A: Contact admin to extend time. Admin can modify individual student access.

**Q: What if I make a grading mistake?**
A: You can regrade any submission before or after publication. Students are notified of changes.

**Q: How do I export grades to my gradebook?**
A: Use the Export Results feature to download CSV/Excel file compatible with most gradebook systems.

## For Admins

**Q: Can I schedule recurring exams?**
A: Not automatically. You need to create each exam instance separately.

**Q: How do I handle exam conflicts?**
A: System warns if students have overlapping exams. Reschedule one exam to avoid conflicts.

**Q: Can I copy an exam to another course?**
A: Yes, use the "Duplicate Exam" feature and select target course.

**Q: How long is exam data retained?**
A: Indefinitely unless manually deleted. Implement data retention policy as needed.

**Q: Can I restore a deleted exam?**
A: No, deletion is permanent. Always backup important data before deletion.

---

## Support Contact

For additional help:
- **Technical Support**: support@yourdomain.com
- **Academic Support**: academic@yourdomain.com
- **Emergency Hotline**: +1-XXX-XXX-XXXX (during exam hours)
- **Documentation**: https://docs.yourdomain.com

---

## Appendix: Keyboard Shortcuts

### During Exam (Students)

- `Ctrl + →` : Next question
- `Ctrl + ←` : Previous question
- `Ctrl + S` : Manual save (auto-save is automatic)
- `Ctrl + R` : Review all answers
- `Esc` : Close popups

### Grading Interface (University)

- `Ctrl + →` : Next submission
- `Ctrl + ←` : Previous submission
- `Ctrl + Enter` : Submit grading
- `Tab` : Move to next input field

---

## Document Version

- **Version**: 1.0
- **Last Updated**: March 2024
- **Next Review**: June 2024

For the latest version of this guide, visit the documentation portal.
