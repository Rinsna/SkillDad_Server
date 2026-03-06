const socketService = require('./SocketService');
const Exam = require('../models/examModel');
const ExamSubmissionNew = require('../models/examSubmissionNewModel');
const examAccessService = require('./examAccessService');

/**
 * Exam WebSocket Service
 * Manages real-time exam timer broadcasts and auto-submission
 */

class ExamWebSocketService {
  constructor() {
    this.activeTimers = new Map(); // examId -> intervalId
    this.examRooms = new Map(); // examId -> Set of studentIds
  }

  /**
   * Initialize exam-specific WebSocket event handlers
   * Called after Socket.IO server is initialized
   */
  init() {
    if (!socketService.io) {
      console.error('[ExamWebSocket] Socket.IO not initialized');
      return;
    }

    const io = socketService.io;

    // Handle exam-specific events
    io.on('connection', (socket) => {
      // Student joins exam room
      socket.on('join-exam', async (data) => {
        try {
          await this.joinExam(socket, data.examId, data.studentId);
        } catch (error) {
          console.error('[ExamWebSocket] Error joining exam:', error);
          socket.emit('exam-error', { 
            message: 'Failed to join exam room',
            error: error.message 
          });
        }
      });

      // Student leaves exam room
      socket.on('leave-exam', (data) => {
        try {
          this.leaveExam(socket, data.examId, data.studentId);
        } catch (error) {
          console.error('[ExamWebSocket] Error leaving exam:', error);
        }
      });

      // Handle reconnection
      socket.on('reconnect-exam', async (data) => {
        try {
          await this.handleReconnection(socket, data.examId, data.studentId);
        } catch (error) {
          console.error('[ExamWebSocket] Error reconnecting to exam:', error);
          socket.emit('exam-error', { 
            message: 'Failed to reconnect to exam',
            error: error.message 
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        // Clean up exam room memberships for this socket
        this.examRooms.forEach((students, examId) => {
          if (students.has(socket.userId)) {
            students.delete(socket.userId);
            console.log(`[ExamWebSocket] User ${socket.userId} disconnected from exam ${examId}`);
            
            // Clean up empty rooms
            if (students.size === 0) {
              this.examRooms.delete(examId);
              console.log(`[ExamWebSocket] Exam room ${examId} is now empty, removed from tracking`);
            }
          }
        });
      });

      // Handle connection errors
      socket.on('error', (error) => {
        console.error(`[ExamWebSocket] Socket error for user ${socket.userId}:`, error);
      });
    });

    console.log('[ExamWebSocket] Exam WebSocket service initialized');
  }

  /**
   * Student joins exam room for real-time updates
   * 
   * @param {Socket} socket - Socket.IO socket instance
   * @param {string} examId - Exam ID to join
   * @param {string} studentId - Student ID joining
   */
  async joinExam(socket, examId, studentId) {
    // Validate access
    const accessCheck = await examAccessService.checkExamAccess(examId, studentId);
    
    if (!accessCheck.canAccess) {
      socket.emit('exam-access-denied', {
        examId,
        reason: accessCheck.reason
      });
      return;
    }

    // Join Socket.IO room
    const roomName = `exam-${examId}`;
    socket.join(roomName);

    // Track student in exam room
    if (!this.examRooms.has(examId)) {
      this.examRooms.set(examId, new Set());
    }
    this.examRooms.get(examId).add(studentId);

    // Also join student-specific room for targeted notifications
    socket.join(`student-${studentId}`);

    console.log(`[ExamWebSocket] Student ${studentId} joined exam ${examId}`);

    // Send current time remaining
    const exam = accessCheck.exam;
    const timeRemaining = examAccessService.calculateTimeRemaining(exam);

    socket.emit('exam-joined', {
      examId,
      timeRemaining,
      timestamp: new Date()
    });

    // Start timer if not already running
    if (!this.activeTimers.has(examId)) {
      await this.startExamTimer(examId);
    }
  }

  /**
   * Student leaves exam room
   * 
   * @param {Socket} socket - Socket.IO socket instance
   * @param {string} examId - Exam ID to leave
   * @param {string} studentId - Student ID leaving
   */
  leaveExam(socket, examId, studentId) {
    const roomName = `exam-${examId}`;
    socket.leave(roomName);

    // Remove student from tracking
    if (this.examRooms.has(examId)) {
      this.examRooms.get(examId).delete(studentId);
      
      // Clean up empty room
      if (this.examRooms.get(examId).size === 0) {
        this.examRooms.delete(examId);
      }
    }

    console.log(`[ExamWebSocket] Student ${studentId} left exam ${examId}`);
  }

  /**
   * Handle WebSocket reconnection
   * Restores exam room membership and syncs timer state
   * 
   * @param {Socket} socket - Socket.IO socket instance
   * @param {string} examId - Exam ID to reconnect to
   * @param {string} studentId - Student ID reconnecting
   */
  async handleReconnection(socket, examId, studentId) {
    console.log(`[ExamWebSocket] Student ${studentId} reconnecting to exam ${examId}`);

    // Check if student has an in-progress submission
    const submission = await ExamSubmissionNew.findOne({
      exam: examId,
      student: studentId,
      status: 'in-progress'
    });

    if (!submission) {
      socket.emit('exam-error', {
        message: 'No active exam session found'
      });
      return;
    }

    // Rejoin exam room
    await this.joinExam(socket, examId, studentId);

    // Sync timer state
    const exam = await Exam.findById(examId);
    if (exam) {
      const timeRemaining = examAccessService.calculateTimeRemaining(exam);
      
      socket.emit('timer-sync', {
        examId,
        timeRemaining,
        timestamp: new Date()
      });
    }

    console.log(`[ExamWebSocket] Student ${studentId} reconnected to exam ${examId}`);
  }

  /**
   * Starts countdown timer for exam
   * Broadcasts updates every minute and triggers auto-submit at expiry
   * 
   * @param {string} examId - Exam ID to start timer for
   */
  async startExamTimer(examId) {
    const exam = await Exam.findById(examId);
    
    if (!exam) {
      console.error(`[ExamWebSocket] Exam ${examId} not found`);
      return;
    }

    // Check if exam has ended
    if (examAccessService.hasExamEnded(exam)) {
      console.log(`[ExamWebSocket] Exam ${examId} has already ended`);
      await this.handleExamTimeout(examId);
      return;
    }

    console.log(`[ExamWebSocket] Starting timer for exam ${examId}`);

    // Set up interval for timer broadcasts
    const timerInterval = setInterval(async () => {
      try {
        const currentExam = await Exam.findById(examId);
        
        if (!currentExam) {
          console.error(`[ExamWebSocket] Exam ${examId} not found, stopping timer`);
          this.stopExamTimer(examId);
          return;
        }

        const now = new Date();
        const timeRemaining = examAccessService.calculateTimeRemaining(currentExam);

        // Check if time expired
        if (timeRemaining <= 0) {
          console.log(`[ExamWebSocket] Exam ${examId} time expired`);
          this.stopExamTimer(examId);
          await this.handleExamTimeout(examId);
          return;
        }

        // Broadcast time remaining to all students in exam room
        this.broadcastTimeRemaining(examId, timeRemaining);

        // Send warnings at specific intervals
        if (timeRemaining === 300) { // 5 minutes
          this.sendTimeWarning(examId, '5 minutes remaining', 300);
        } else if (timeRemaining === 60) { // 1 minute
          this.sendTimeWarning(examId, '1 minute remaining', 60);
        }
      } catch (error) {
        console.error(`[ExamWebSocket] Error in timer for exam ${examId}:`, error);
      }
    }, 60000); // Every minute

    // Store interval ID for cleanup
    this.activeTimers.set(examId, timerInterval);
  }

  /**
   * Stops exam timer
   * 
   * @param {string} examId - Exam ID to stop timer for
   */
  stopExamTimer(examId) {
    const timerInterval = this.activeTimers.get(examId);
    
    if (timerInterval) {
      clearInterval(timerInterval);
      this.activeTimers.delete(examId);
      console.log(`[ExamWebSocket] Stopped timer for exam ${examId}`);
    }
  }

  /**
   * Broadcasts time remaining to all students in exam
   * 
   * @param {string} examId - Exam ID
   * @param {number} timeRemaining - Time remaining in seconds
   */
  broadcastTimeRemaining(examId, timeRemaining) {
    if (!socketService.io) return;

    const roomName = `exam-${examId}`;
    socketService.io.to(roomName).emit('time-remaining', {
      examId,
      timeRemaining,
      timestamp: new Date()
    });
  }

  /**
   * Sends time warning notification to exam room
   * 
   * @param {string} examId - Exam ID
   * @param {string} message - Warning message
   * @param {number} timeRemaining - Time remaining in seconds
   */
  sendTimeWarning(examId, message, timeRemaining) {
    if (!socketService.io) return;

    const roomName = `exam-${examId}`;
    socketService.io.to(roomName).emit('time-warning', {
      examId,
      message,
      timeRemaining,
      timestamp: new Date()
    });

    console.log(`[ExamWebSocket] Sent warning for exam ${examId}: ${message}`);
  }

  /**
   * Handles exam timeout by auto-submitting all in-progress submissions
   * 
   * @param {string} examId - Exam ID that timed out
   */
  async handleExamTimeout(examId) {
    console.log(`[ExamWebSocket] Handling timeout for exam ${examId}`);

    try {
      // Find all in-progress submissions
      const inProgressSubmissions = await ExamSubmissionNew.find({
        exam: examId,
        status: 'in-progress'
      });

      console.log(`[ExamWebSocket] Found ${inProgressSubmissions.length} in-progress submissions`);

      // Auto-submit each submission
      for (const submission of inProgressSubmissions) {
        submission.submittedAt = new Date();
        submission.timeSpent = Math.floor(
          (submission.submittedAt - submission.startedAt) / 1000
        );
        submission.isAutoSubmitted = true;
        submission.status = 'submitted';
        
        await submission.save();

        // Notify specific student of auto-submission
        if (socketService.io) {
          socketService.io.to(`student-${submission.student}`).emit('auto-submit', {
            examId,
            submissionId: submission._id,
            message: 'Exam time expired. Your answers have been submitted automatically.',
            timestamp: new Date()
          });
        }

        console.log(`[ExamWebSocket] Auto-submitted submission ${submission._id} for student ${submission.student}`);
      }

      // Update exam status to completed
      await examAccessService.completeExam(examId);

      // Broadcast exam completion to all students
      if (socketService.io) {
        socketService.io.to(`exam-${examId}`).emit('exam-completed', {
          examId,
          message: 'Exam has ended',
          autoSubmittedCount: inProgressSubmissions.length,
          timestamp: new Date()
        });
      }

      // Clean up timer
      this.stopExamTimer(examId);

      // Clean up exam room tracking
      this.examRooms.delete(examId);

      console.log(`[ExamWebSocket] Completed timeout handling for exam ${examId}`);
    } catch (error) {
      console.error(`[ExamWebSocket] Error handling timeout for exam ${examId}:`, error);
      throw error;
    }
  }

  /**
   * Notifies exam room of status change
   * 
   * @param {string} examId - Exam ID
   * @param {string} newStatus - New exam status
   * @param {string} message - Status change message
   */
  notifyExamStatusChange(examId, newStatus, message) {
    if (!socketService.io) return;

    const roomName = `exam-${examId}`;
    socketService.io.to(roomName).emit('exam-status-change', {
      examId,
      status: newStatus,
      message,
      timestamp: new Date()
    });

    console.log(`[ExamWebSocket] Notified status change for exam ${examId}: ${newStatus}`);
  }

  /**
   * Gets active exam timers count (for monitoring)
   * 
   * @returns {number} Number of active timers
   */
  getActiveTimersCount() {
    return this.activeTimers.size;
  }

  /**
   * Gets exam room participants count
   * 
   * @param {string} examId - Exam ID
   * @returns {number} Number of students in exam room
   */
  getExamRoomSize(examId) {
    return this.examRooms.get(examId)?.size || 0;
  }

  /**
   * Starts timers for all ongoing exams
   * Called on server startup to resume timers
   */
  async startTimersForOngoingExams() {
    try {
      const now = new Date();
      
      // Find all exams that are ongoing or scheduled but have started
      const ongoingExams = await Exam.find({
        status: { $in: ['scheduled', 'ongoing'] },
        scheduledStartTime: { $lte: now },
        scheduledEndTime: { $gt: now }
      });

      console.log(`[ExamWebSocket] Found ${ongoingExams.length} ongoing exams to start timers for`);

      for (const exam of ongoingExams) {
        // Check if exam has any in-progress submissions
        const hasActiveSubmissions = await ExamSubmissionNew.exists({
          exam: exam._id,
          status: 'in-progress'
        });

        if (hasActiveSubmissions) {
          await this.startExamTimer(exam._id.toString());
          console.log(`[ExamWebSocket] Started timer for exam ${exam._id}`);
        }
      }
    } catch (error) {
      console.error('[ExamWebSocket] Error starting timers for ongoing exams:', error);
    }
  }

  /**
   * Cleanup all active timers
   * Called on server shutdown
   */
  cleanup() {
    console.log(`[ExamWebSocket] Cleaning up ${this.activeTimers.size} active timers`);
    
    this.activeTimers.forEach((interval, examId) => {
      clearInterval(interval);
      console.log(`[ExamWebSocket] Stopped timer for exam ${examId}`);
    });
    
    this.activeTimers.clear();
    this.examRooms.clear();
  }
}

// Export singleton instance
module.exports = new ExamWebSocketService();
