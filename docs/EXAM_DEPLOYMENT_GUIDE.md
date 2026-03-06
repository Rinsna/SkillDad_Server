# Exam Management System - Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Exam Management System in production. The system requires MongoDB, Redis (for WebSocket scaling), file storage (AWS S3 or local), and proper environment configuration.

---

## Prerequisites

Before deployment, ensure you have:

- Node.js 16.x or higher
- MongoDB 5.0 or higher
- Redis 6.x or higher (for WebSocket scaling)
- AWS S3 account (or alternative file storage)
- SMTP server for email notifications
- SSL certificate for HTTPS
- Domain name configured

---

## Environment Variables Setup

### Required Environment Variables

Create a `.env` file in the `server` directory with the following variables:

```bash
# Server Configuration
NODE_ENV=production
PORT=5000
CLIENT_URL=https://yourdomain.com

# Database
MONGO_URI=mongodb://username:password@host:port/database?authSource=admin
MONGO_URI_TEST=mongodb://localhost:27017/exam_system_test

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRE=7d

# Redis (for WebSocket scaling)
REDIS_HOST=your-redis-host
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# File Storage - AWS S3
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-exam-bucket

# File Storage - Alternative (Local)
FILE_STORAGE_TYPE=s3  # or 'local'
LOCAL_STORAGE_PATH=/var/www/uploads
FILE_BASE_URL=https://yourdomain.com/uploads

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-email-password
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Exam System

# WebSocket Configuration
WEBSOCKET_CORS_ORIGIN=https://yourdomain.com
WEBSOCKET_PATH=/socket.io

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
FILE_UPLOAD_RATE_LIMIT=10  # per hour
EXAM_START_RATE_LIMIT=3  # per exam per student

# File Upload Limits
MAX_QUESTION_PAPER_SIZE=10485760  # 10MB in bytes
MAX_ANSWER_SHEET_SIZE=20971520    # 20MB in bytes

# Exam Configuration
AUTO_SUBMISSION_CHECK_INTERVAL=60000  # 1 minute in ms
TIMER_BROADCAST_INTERVAL=60000        # 1 minute in ms
WEBSOCKET_RECONNECT_ATTEMPTS=5
WEBSOCKET_RECONNECT_DELAY=1000        # 1 second

# Security
BCRYPT_ROUNDS=10
CORS_ORIGIN=https://yourdomain.com
HELMET_ENABLED=true

# Logging
LOG_LEVEL=info  # debug, info, warn, error
LOG_FILE_PATH=/var/log/exam-system/app.log
```

### Environment Variable Validation

The system validates all required environment variables on startup. Missing variables will cause the application to fail with descriptive error messages.

---

## Database Setup

### MongoDB Configuration

1. **Create Database and User:**

```javascript
// Connect to MongoDB
use exam_system

// Create application user
db.createUser({
  user: "exam_app",
  pwd: "secure-password-here",
  roles: [
    { role: "readWrite", db: "exam_system" }
  ]
})
```

2. **Create Required Indexes:**

Run the index creation script:

```bash
cd server
node scripts/createIndexes.js
```

Or manually create indexes:

```javascript
// Exam indexes
db.exams.createIndex({ course: 1, scheduledStartTime: 1 })
db.exams.createIndex({ university: 1, status: 1 })
db.exams.createIndex({ status: 1, scheduledEndTime: 1 })

// Question indexes
db.questions.createIndex({ exam: 1, order: 1 })

// Submission indexes
db.submissions.createIndex({ exam: 1, student: 1 }, { unique: true })
db.submissions.createIndex({ exam: 1, status: 1 })
db.submissions.createIndex({ student: 1, createdAt: -1 })

// Result indexes
db.results.createIndex({ exam: 1, student: 1 }, { unique: true })
db.results.createIndex({ exam: 1, rank: 1 })
db.results.createIndex({ student: 1, isPublished: 1 })
```

3. **Configure MongoDB for Production:**

Edit `/etc/mongod.conf`:

```yaml
# Network interfaces
net:
  port: 27017
  bindIp: 127.0.0.1,your-app-server-ip

# Security
security:
  authorization: enabled

# Storage
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

# Replication (recommended for production)
replication:
  replSetName: rs0
```

4. **Enable MongoDB Replication (Recommended):**

```bash
# Initialize replica set
mongo --eval "rs.initiate()"

# Add members if using multiple servers
mongo --eval "rs.add('mongodb2.example.com:27017')"
```

---

## Redis Setup

### Redis Configuration for WebSocket Scaling

1. **Install Redis:**

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install redis-server

# CentOS/RHEL
sudo yum install redis
```

2. **Configure Redis:**

Edit `/etc/redis/redis.conf`:

```conf
# Bind to specific IP
bind 127.0.0.1 your-app-server-ip

# Set password
requirepass your-redis-password

# Enable persistence
save 900 1
save 300 10
save 60 10000

# Max memory policy
maxmemory 256mb
maxmemory-policy allkeys-lru

# Logging
loglevel notice
logfile /var/log/redis/redis-server.log
```

3. **Start Redis:**

```bash
sudo systemctl start redis
sudo systemctl enable redis
```

4. **Test Redis Connection:**

```bash
redis-cli -h your-redis-host -p 6379 -a your-redis-password ping
# Should return: PONG
```

---

## File Storage Configuration

### Option 1: AWS S3 (Recommended)

1. **Create S3 Bucket:**

```bash
aws s3 mb s3://your-exam-bucket --region us-east-1
```

2. **Configure Bucket Policy:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAppAccess",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-ACCOUNT-ID:user/exam-app"
      },
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-exam-bucket/*"
    }
  ]
}
```

3. **Configure CORS:**

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

4. **Create IAM User:**

```bash
# Create user
aws iam create-user --user-name exam-app

# Attach policy
aws iam attach-user-policy \
  --user-name exam-app \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create access keys
aws iam create-access-key --user-name exam-app
```

### Option 2: Local File Storage

1. **Create Upload Directory:**

```bash
sudo mkdir -p /var/www/uploads/exams/question-papers
sudo mkdir -p /var/www/uploads/exams/answer-sheets
sudo chown -R www-data:www-data /var/www/uploads
sudo chmod -R 755 /var/www/uploads
```

2. **Configure Nginx for File Serving:**

```nginx
location /uploads {
    alias /var/www/uploads;
    expires 1h;
    add_header Cache-Control "public, immutable";
}
```

---

## Application Deployment

### 1. Clone and Install Dependencies

```bash
# Clone repository
git clone https://github.com/your-org/exam-system.git
cd exam-system

# Install server dependencies
cd server
npm install --production

# Install client dependencies
cd ../client
npm install
```

### 2. Build Frontend

```bash
cd client
npm run build

# Build output will be in client/dist
```

### 3. Configure Process Manager (PM2)

Install PM2:

```bash
npm install -g pm2
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'exam-api',
      script: './server/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: '/var/log/exam-system/api-error.log',
      out_file: '/var/log/exam-system/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true,
      watch: false
    }
  ]
};
```

Start application:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Configure Nginx Reverse Proxy

Create `/etc/nginx/sites-available/exam-system`:

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=10r/h;

# Upstream servers
upstream exam_api {
    least_conn;
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    server 127.0.0.1:5002;
    server 127.0.0.1:5003;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Client body size for file uploads
    client_max_body_size 25M;

    # Frontend (React app)
    location / {
        root /var/www/exam-system/client/dist;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # API endpoints
    location /api {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://exam_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # File upload endpoints (stricter rate limiting)
    location ~ ^/api/exams/.*/question-paper$ {
        limit_req zone=upload_limit burst=2 nodelay;
        
        proxy_pass http://exam_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Extended timeouts for uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # WebSocket endpoint
    location /socket.io {
        proxy_pass http://exam_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Static file uploads (if using local storage)
    location /uploads {
        alias /var/www/uploads;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/exam-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. SSL Certificate Setup (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (already configured by certbot)
sudo certbot renew --dry-run
```

---

## WebSocket Scaling Configuration

### Configure Socket.IO with Redis Adapter

The application is already configured to use Redis adapter when `REDIS_HOST` is set. Verify in `server/server.js`:

```javascript
// Redis adapter for Socket.IO (horizontal scaling)
if (process.env.REDIS_HOST) {
  const { createAdapter } = require('@socket.io/redis-adapter');
  const { createClient } = require('redis');
  
  const pubClient = createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
  });
  
  const subClient = pubClient.duplicate();
  
  io.adapter(createAdapter(pubClient, subClient));
}
```

### Load Balancing Multiple Instances

With PM2 cluster mode and Redis adapter, WebSocket connections work across multiple instances automatically.

Test scaling:

```bash
# Start 4 instances
pm2 start ecosystem.config.js -i 4

# Monitor instances
pm2 monit

# Check logs
pm2 logs exam-api
```

---

## Database Migration

### Run Migration Scripts

```bash
cd server

# Create indexes
node scripts/createIndexes.js

# Migrate existing data (if upgrading)
node scripts/migrateExamData.js
```

### Backup Before Migration

```bash
# Backup MongoDB
mongodump --uri="mongodb://username:password@host:port/exam_system" --out=/backup/exam_system_$(date +%Y%m%d)

# Backup files (if using local storage)
tar -czf /backup/exam_uploads_$(date +%Y%m%d).tar.gz /var/www/uploads
```

---

## Monitoring and Logging

### 1. Application Logs

Configure log rotation in `/etc/logrotate.d/exam-system`:

```
/var/log/exam-system/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 2. MongoDB Monitoring

```bash
# Enable MongoDB monitoring
mongo --eval "db.enableFreeMonitoring()"

# Check database stats
mongo exam_system --eval "db.stats()"

# Monitor slow queries
mongo exam_system --eval "db.setProfilingLevel(1, { slowms: 100 })"
```

### 3. Redis Monitoring

```bash
# Monitor Redis
redis-cli -h your-redis-host -a your-redis-password monitor

# Check memory usage
redis-cli -h your-redis-host -a your-redis-password info memory
```

### 4. PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Web dashboard
pm2 install pm2-server-monit
```

---

## Security Checklist

- [ ] All environment variables configured securely
- [ ] MongoDB authentication enabled
- [ ] Redis password set
- [ ] SSL certificate installed and auto-renewal configured
- [ ] Firewall configured (only ports 80, 443, 22 open)
- [ ] File upload size limits enforced
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Security headers enabled in Nginx
- [ ] Regular backups scheduled
- [ ] Log rotation configured
- [ ] PM2 process monitoring enabled
- [ ] Database indexes created
- [ ] S3 bucket policy restricted (if using S3)

---

## Performance Optimization

### 1. Enable Caching

Configure Redis caching for frequently accessed data:

```javascript
// Cache exam details (5 minutes)
// Cache question lists (until exam starts)
// Cache result statistics (10 minutes)
```

### 2. Database Query Optimization

- Use `.lean()` for read-only queries
- Implement selective population
- Use aggregation pipelines for statistics
- Monitor slow queries

### 3. CDN Configuration (Optional)

Use CloudFront or similar CDN for static assets:

```nginx
# Add CDN headers
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## Backup and Disaster Recovery

### Automated Backup Script

Create `/opt/exam-system/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/backup/exam-system"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup MongoDB
mongodump --uri="$MONGO_URI" --out="$BACKUP_DIR/mongo_$DATE"

# Backup files (if local storage)
if [ "$FILE_STORAGE_TYPE" = "local" ]; then
    tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" /var/www/uploads
fi

# Backup environment config
cp /path/to/server/.env "$BACKUP_DIR/env_$DATE"

# Remove backups older than 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

Schedule with cron:

```bash
# Daily backup at 2 AM
0 2 * * * /opt/exam-system/backup.sh >> /var/log/exam-system/backup.log 2>&1
```

### Disaster Recovery Steps

1. **Restore MongoDB:**
```bash
mongorestore --uri="$MONGO_URI" /backup/exam-system/mongo_YYYYMMDD
```

2. **Restore Files:**
```bash
tar -xzf /backup/exam-system/uploads_YYYYMMDD.tar.gz -C /
```

3. **Restart Services:**
```bash
pm2 restart all
sudo systemctl restart nginx
```

---

## Health Checks

### Application Health Endpoint

The system provides a health check endpoint:

```bash
curl https://yourdomain.com/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-03-15T10:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "storage": "accessible"
  }
}
```

### Monitoring Script

Create `/opt/exam-system/healthcheck.sh`:

```bash
#!/bin/bash

HEALTH_URL="https://yourdomain.com/api/health"
ALERT_EMAIL="admin@yourdomain.com"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $response -ne 200 ]; then
    echo "Health check failed with status: $response" | mail -s "Exam System Alert" $ALERT_EMAIL
    pm2 restart exam-api
fi
```

Schedule with cron:

```bash
# Check every 5 minutes
*/5 * * * * /opt/exam-system/healthcheck.sh
```

---

## Troubleshooting

### Common Issues

**1. WebSocket Connection Fails:**
- Check Nginx WebSocket configuration
- Verify Redis connection
- Check firewall rules
- Review CORS settings

**2. File Upload Fails:**
- Check file size limits in Nginx
- Verify S3 credentials
- Check disk space (local storage)
- Review upload rate limits

**3. Database Connection Issues:**
- Verify MongoDB is running
- Check connection string
- Review firewall rules
- Check authentication credentials

**4. High Memory Usage:**
- Review PM2 max_memory_restart setting
- Check for memory leaks in logs
- Monitor Redis memory usage
- Review database query performance

### Debug Mode

Enable debug logging:

```bash
# Set in .env
LOG_LEVEL=debug

# Restart application
pm2 restart exam-api
pm2 logs exam-api --lines 100
```

---

## Post-Deployment Verification

### 1. Functional Tests

```bash
# Test API health
curl https://yourdomain.com/api/health

# Test authentication
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Test WebSocket connection
# Use browser console or WebSocket client
```

### 2. Performance Tests

```bash
# Load test with Apache Bench
ab -n 1000 -c 10 https://yourdomain.com/api/exams

# Monitor during load test
pm2 monit
```

### 3. Security Scan

```bash
# SSL test
nmap --script ssl-enum-ciphers -p 443 yourdomain.com

# Security headers test
curl -I https://yourdomain.com
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Review error logs
- Check disk space
- Monitor backup completion

**Weekly:**
- Review performance metrics
- Check database slow queries
- Update dependencies (security patches)

**Monthly:**
- Full system backup verification
- Security audit
- Performance optimization review
- Update SSL certificates (if needed)

---

## Support and Documentation

For additional help:
- API Documentation: `/server/docs/EXAM_API_DOCUMENTATION.md`
- User Guides: `/server/docs/EXAM_USER_GUIDES.md`
- GitHub Issues: https://github.com/your-org/exam-system/issues

---

## Rollback Procedure

If deployment fails:

1. **Stop new version:**
```bash
pm2 stop exam-api
```

2. **Restore previous version:**
```bash
git checkout previous-release-tag
npm install --production
pm2 restart exam-api
```

3. **Restore database (if needed):**
```bash
mongorestore --uri="$MONGO_URI" /backup/exam-system/mongo_YYYYMMDD
```

4. **Verify rollback:**
```bash
curl https://yourdomain.com/api/health
```

---

## Conclusion

This deployment guide covers all aspects of deploying the Exam Management System in production. Follow each section carefully and verify at each step. For production deployments, always test in a staging environment first.
