# Exam WebSocket Service Documentation

## Overview

The Exam WebSocket Service provides real-time timer updates and automatic submission functionality for the exam management system. It uses Socket.IO for bidirectional communication between the server and clients.

## Features

1. **Real-time Timer Broadcasts**: Sends time remaining updates every minute to all students taking an exam
2. **Time Warnings**: Sends notifications at 5 minutes and 1 minute remaining
3. **Auto-submission**: Automatically submits all in-progress submissions when exam time expires
4. **Reconnection Handling**: Supports automatic reconnection with state synchronization
5. **Exam Room Management**: Manages student connections in exam-specific rooms

## Architecture

### Server-Side Components

- **examWebSocketService.js**: Main service handling WebSocket events and timer management
- **SocketService.js**: Base Socket.IO initialization and authentication
- **examAccessService.js**: Exam access validation and time calculations

### Client-Side Integration

Clients connect to the WebSocket server using Socket.IO client library with JWT authentication.

## WebSocket Events

### Client → Server Events

#### `join-exam`
Student joins an exam room to receive real-time updates.

**Payload:**
```javascript
{
  examId: string,
  studentId: string
}
```

**Response Events:**
- `exam-joined`: Successfully joined exam room
- `exam-access-denied`: Access denied with reason
- `exam-error`: Error occurred

#### `leave-exam`
Student leaves an exam room.

**Payload:**
```javascript
{
  examId: string,
  studentId: string
}
```

#### `reconnect-exam`
Student reconnects to an exam room after connection loss.

**Payload:**
```javascript
{
  examId: string,
  studentId: string
}
```

**Response Events:**
- `exam-joined`: Successfully reconnected
- `timer-sync`: Current timer state
- `exam-error`: Error occurred

### Server → Client Events

#### `exam-joined`
Sent when student successfully joins exam room.

**Payload:**
```javascript
{
  examId: string,
  timeRemaining: number, // seconds
  timestamp: Date
}
```

#### `time-remaining`
Broadcast every minute to all students in exam room.

**Payload:**
```javascript
{
  examId: string,
  timeRemaining: number, // seconds
  timestamp: Date
}
```

#### `time-warning`
Sent at 5 minutes and 1 minute remaining.

**Payload:**
```javascript
{
  examId: string,
  message: string, // "5 minutes remaining" or "1 minute remaining"
  timeRemaining: number, // 300 or 60 seconds
  timestamp: Date
}
```

#### `auto-submit`
Sent to individual student when their submission is auto-submitted.

**Payload:**
```javascript
{
  examId: string,
  submissionId: string,
  message: string,
  timestamp: Date
}
```

#### `exam-completed`
Broadcast to all students when exam ends.

**Payload:**
```javascript
{
  examId: string,
  message: string,
  autoSubmittedCount: number,
  timestamp: Date
}
```

#### `exam-status-change`
Sent when exam status changes.

**Payload:**
```javascript
{
  examId: string,
  status: string,
  message: string,
  timestamp: Date
}
```

#### `timer-sync`
Sent during reconnection to sync timer state.

**Payload:**
```javascript
{
  examId: string,
  timeRemaining: number, // seconds
  timestamp: Date
}
```

#### `exam-access-denied`
Sent when student cannot access exam.

**Payload:**
```javascript
{
  examId: string,
  reason: string
}
```

#### `exam-error`
Sent when an error occurs.

**Payload:**
```javascript
{
  message: string,
  error?: string
}
```

## Client Implementation Example

### React Hook for Exam WebSocket

```javascript
import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

export const useExamWebSocket = (examId, studentId, token) => {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    // Initialize socket connection
    const socket = io(process.env.REACT_APP_API_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      // Join exam room
      socket.emit('join-exam', { examId, studentId });
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socket.on('reconnect', () => {
      console.log('WebSocket reconnected');
      // Rejoin exam room
      socket.emit('reconnect-exam', { examId, studentId });
    });

    // Exam events
    socket.on('exam-joined', (data) => {
      console.log('Joined exam room:', data);
      setTimeRemaining(data.timeRemaining);
    });

    socket.on('time-remaining', (data) => {
      console.log('Time remaining:', data.timeRemaining);
      setTimeRemaining(data.timeRemaining);
    });

    socket.on('time-warning', (data) => {
      console.log('Time warning:', data.message);
      setWarnings(prev => [...prev, data]);
      // Show notification to user
      alert(data.message);
    });

    socket.on('auto-submit', (data) => {
      console.log('Auto-submitted:', data);
      // Redirect to submission confirmation page
      window.location.href = `/exam/${examId}/submitted`;
    });

    socket.on('exam-completed', (data) => {
      console.log('Exam completed:', data);
      // Show completion message
    });

    socket.on('timer-sync', (data) => {
      console.log('Timer synced:', data);
      setTimeRemaining(data.timeRemaining);
    });

    socket.on('exam-access-denied', (data) => {
      console.error('Access denied:', data.reason);
      // Redirect or show error
    });

    socket.on('exam-error', (data) => {
      console.error('Exam error:', data.message);
    });

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-exam', { examId, studentId });
        socketRef.current.disconnect();
      }
    };
  }, [examId, studentId, token]);

  return {
    timeRemaining,
    isConnected,
    warnings,
    socket: socketRef.current
  };
};
```

### Usage in Component

```javascript
import React from 'react';
import { useExamWebSocket } from './hooks/useExamWebSocket';

const ExamTaker = ({ examId, studentId, token }) => {
  const { timeRemaining, isConnected, warnings } = useExamWebSocket(
    examId,
    studentId,
    token
  );

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="timer-display">
        {isConnected ? (
          <span className={timeRemaining <= 300 ? 'warning' : ''}>
            Time Remaining: {formatTime(timeRemaining)}
          </span>
        ) : (
          <span className="disconnected">Reconnecting...</span>
        )}
      </div>
      
      {/* Exam content */}
    </div>
  );
};
```

## Server-Side Usage

### Starting Timer for an Exam

The timer is automatically started when the first student joins an exam room. However, you can manually start it:

```javascript
const examWebSocketService = require('./services/examWebSocketService');

// Start timer for an exam
await examWebSocketService.startExamTimer(examId);
```

### Stopping Timer

```javascript
examWebSocketService.stopExamTimer(examId);
```

### Broadcasting Custom Messages

```javascript
// Notify status change
examWebSocketService.notifyExamStatusChange(
  examId,
  'ongoing',
  'Exam has started'
);

// Broadcast time remaining
examWebSocketService.broadcastTimeRemaining(examId, 1800); // 30 minutes
```

### Monitoring Active Timers

```javascript
// Get count of active timers
const activeCount = examWebSocketService.getActiveTimersCount();

// Get students in exam room
const studentCount = examWebSocketService.getExamRoomSize(examId);
```

## Server Startup Behavior

On server startup, the service automatically:

1. Initializes WebSocket event handlers
2. Starts timers for all ongoing exams with in-progress submissions
3. Resumes timer broadcasts for active exams

This ensures that timers continue running even after server restarts.

## Graceful Shutdown

The service handles graceful shutdown by:

1. Cleaning up all active timer intervals
2. Clearing exam room tracking
3. Logging cleanup actions

This is triggered by SIGTERM or SIGINT signals.

## Error Handling

The service includes comprehensive error handling:

- **Connection Errors**: Logged and emitted to client
- **Timer Errors**: Logged and timer stopped to prevent infinite loops
- **Auto-submission Errors**: Logged and retried
- **Access Validation Errors**: Sent to client with reason

## Performance Considerations

1. **Timer Interval**: Broadcasts every 60 seconds (not every second) to reduce network traffic
2. **Room-based Broadcasting**: Uses Socket.IO rooms for efficient message delivery
3. **Cleanup**: Automatically cleans up empty rooms and stopped timers
4. **Reconnection**: Implements exponential backoff to prevent server overload

## Security

1. **Authentication**: All WebSocket connections require JWT authentication
2. **Access Validation**: Exam access is validated before joining rooms
3. **Student Isolation**: Each student receives targeted auto-submit notifications
4. **CORS**: Configured to allow only trusted origins

## Testing

### Manual Testing

1. Start the server
2. Connect a Socket.IO client with valid JWT token
3. Emit `join-exam` event with valid examId and studentId
4. Observe `time-remaining` events every minute
5. Wait for warnings at 5 and 1 minute marks
6. Observe auto-submission when time expires

### Integration Testing

See `server/tests/examWebSocket.test.js` for automated integration tests.

## Troubleshooting

### Timer Not Starting

- Check if exam has in-progress submissions
- Verify exam time window is valid
- Check server logs for errors

### Students Not Receiving Updates

- Verify WebSocket connection is established
- Check if student successfully joined exam room
- Verify JWT token is valid
- Check CORS configuration

### Auto-submission Not Working

- Check if exam time has actually expired
- Verify submissions exist with 'in-progress' status
- Check server logs for errors in handleExamTimeout

### Reconnection Issues

- Verify Socket.IO client reconnection settings
- Check network connectivity
- Verify JWT token hasn't expired

## Monitoring

Monitor the service using:

```javascript
// Log active timers periodically
setInterval(() => {
  console.log('Active exam timers:', examWebSocketService.getActiveTimersCount());
}, 60000);
```

## Future Enhancements

Potential improvements:

1. Redis adapter for horizontal scaling
2. Persistent timer state in database
3. More granular time updates (e.g., every 10 seconds in last minute)
4. Student activity tracking
5. Proctor notifications for suspicious activity
6. Bandwidth optimization for large exam rooms

## Related Documentation

- [Exam Management System Design](../../.kiro/specs/exam-management-system/design.md)
- [Exam Access Service](./EXAM_ACCESS_SERVICE.md)
- [Socket.IO Documentation](https://socket.io/docs/)
