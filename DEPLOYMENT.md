# Deployment Guide

This guide covers different deployment options for the Modern Accounting System.

## 🚀 Quick Start (Development)

```bash
# Clone the repository
git clone <repository-url>
cd modern-accounting-system

# Install all dependencies
npm run setup

# Start development servers
npm run dev
```

Access the application:
- Frontend: http://localhost:12001
- Backend API: http://localhost:12000

## 🏭 Production Deployment

### Option 1: Traditional Server Deployment

#### Prerequisites
- Node.js 18+ and npm
- PM2 (for process management)
- Nginx (for reverse proxy)

#### Steps

1. **Prepare the server**
   ```bash
   # Install Node.js and PM2
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

2. **Deploy the application**
   ```bash
   # Clone and build
   git clone <repository-url>
   cd modern-accounting-system
   npm run setup
   npm run build
   ```

3. **Configure PM2**
   ```bash
   # Create ecosystem file
   cat > ecosystem.config.js << EOF
   module.exports = {
     apps: [{
       name: 'accounting-system',
       script: 'server/dist/index.js',
       cwd: '/path/to/modern-accounting-system',
       env: {
         NODE_ENV: 'production',
         PORT: 12000
       },
       instances: 'max',
       exec_mode: 'cluster'
     }]
   };
   EOF

   # Start the application
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

4. **Configure Nginx**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       # Serve static files
       location / {
           root /path/to/modern-accounting-system/client/dist;
           try_files $uri $uri/ /index.html;
       }

       # Proxy API requests
       location /api {
           proxy_pass http://localhost:12000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Option 2: Docker Deployment

#### Create Dockerfile

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies
RUN npm run install:all

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy built application
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules

# Create data directory
RUN mkdir -p /app/server/data

# Expose port
EXPOSE 12000

# Start the application
CMD ["node", "server/dist/index.js"]
```

#### Docker Compose

```yaml
version: '3.8'

services:
  accounting-system:
    build: .
    ports:
      - "12000:12000"
    volumes:
      - ./data:/app/server/data
    environment:
      - NODE_ENV=production
      - PORT=12000
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - accounting-system
    restart: unless-stopped
```

#### Deploy with Docker

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Update deployment
git pull
docker-compose build
docker-compose up -d
```

### Option 3: Cloud Platform Deployment

#### Heroku

1. **Prepare for Heroku**
   ```bash
   # Install Heroku CLI
   npm install -g heroku

   # Login and create app
   heroku login
   heroku create your-app-name
   ```

2. **Configure build process**
   ```json
   // Add to package.json
   {
     "scripts": {
       "heroku-postbuild": "npm run build"
     },
     "engines": {
       "node": "18.x"
     }
   }
   ```

3. **Deploy**
   ```bash
   git add .
   git commit -m "Deploy to Heroku"
   git push heroku main
   ```

#### Vercel (Frontend) + Railway (Backend)

1. **Deploy Frontend to Vercel**
   ```bash
   cd client
   npx vercel --prod
   ```

2. **Deploy Backend to Railway**
   ```bash
   cd server
   # Connect to Railway and deploy
   ```

## 🔧 Environment Configuration

### Production Environment Variables

Create `.env` file in the server directory:

```env
# Server Configuration
NODE_ENV=production
PORT=12000
HOST=0.0.0.0

# Security
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here

# Database
DB_PATH=./data/accounting.db
DB_BACKUP_PATH=./data/backups

# File Upload
UPLOAD_PATH=./data/uploads
MAX_FILE_SIZE=10485760

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### Client Environment Variables

Create `.env` file in the client directory:

```env
# API Configuration
VITE_API_BASE_URL=https://your-api-domain.com/api
VITE_APP_NAME=Modern Accounting System
VITE_APP_VERSION=1.0.0

# Features
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_NOTIFICATIONS=true
```

## 🔒 Security Considerations

### SSL/TLS Configuration

1. **Obtain SSL Certificate**
   ```bash
   # Using Let's Encrypt
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

2. **Update Nginx Configuration**
   ```nginx
   server {
       listen 443 ssl http2;
       server_name your-domain.com;

       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

       # Security headers
       add_header X-Frame-Options DENY;
       add_header X-Content-Type-Options nosniff;
       add_header X-XSS-Protection "1; mode=block";
       add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

       # Your existing configuration...
   }
   ```

### Database Security

1. **Backup Strategy**
   ```bash
   # Create backup script
   cat > backup.sh << EOF
   #!/bin/bash
   DATE=$(date +%Y%m%d_%H%M%S)
   cp /path/to/accounting.db /path/to/backups/accounting_$DATE.db
   # Keep only last 30 days
   find /path/to/backups -name "accounting_*.db" -mtime +30 -delete
   EOF

   # Schedule with cron
   crontab -e
   # Add: 0 2 * * * /path/to/backup.sh
   ```

2. **File Permissions**
   ```bash
   # Secure database files
   chmod 600 /path/to/accounting.db
   chown app:app /path/to/accounting.db
   ```

## 📊 Monitoring and Maintenance

### Health Checks

```bash
# API Health Check
curl -f http://localhost:12000/api/health || exit 1

# Database Check
curl -f http://localhost:12000/api/health/db || exit 1
```

### Log Management

```bash
# View application logs
pm2 logs accounting-system

# Rotate logs
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### Performance Monitoring

```bash
# Monitor with PM2
pm2 monit

# System monitoring
htop
iostat -x 1
```

## 🔄 Updates and Maintenance

### Application Updates

```bash
# Backup before update
npm run backup

# Pull latest changes
git pull origin main

# Install dependencies and rebuild
npm run install:all
npm run build

# Restart application
pm2 restart accounting-system
```

### Database Migrations

```bash
# Run migrations (when available)
cd server
npm run migrate

# Verify data integrity
npm run verify
```

## 🆘 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find and kill process
   lsof -ti:12000 | xargs kill -9
   ```

2. **Database Locked**
   ```bash
   # Check for zombie processes
   ps aux | grep node
   # Kill if necessary
   ```

3. **Permission Denied**
   ```bash
   # Fix file permissions
   chown -R app:app /path/to/modern-accounting-system
   chmod -R 755 /path/to/modern-accounting-system
   ```

### Log Locations

- Application logs: `/var/log/accounting-system/`
- Nginx logs: `/var/log/nginx/`
- PM2 logs: `~/.pm2/logs/`

### Recovery Procedures

1. **Database Recovery**
   ```bash
   # Restore from backup
   cp /path/to/backups/accounting_YYYYMMDD.db /path/to/accounting.db
   ```

2. **Application Recovery**
   ```bash
   # Reset to last known good state
   git reset --hard HEAD~1
   npm run build
   pm2 restart accounting-system
   ```

---

**Need help?** Check the logs first, then refer to the troubleshooting section or create an issue in the repository.