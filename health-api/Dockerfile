FROM node:19.9.0-alpine

WORKDIR /app

# Copy package files
COPY health-api/package*.json ./health-api/
COPY package*.json ./

# Install dependencies
WORKDIR /app/health-api
RUN npm ci --only=production

# Copy source code
COPY health-api/src ./src
COPY health-api/tsconfig.json ./

# Copy main bot utilities (for health checker)
COPY src/util /app/src/util

# Build
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
