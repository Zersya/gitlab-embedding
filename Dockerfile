# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Install git
RUN apk add --no-cache git

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build the TypeScript code
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install git
RUN apk add --no-cache git

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --production

# Copy built files from build stage
COPY --from=build /app/dist ./dist

# Create temp directory for repository cloning
RUN mkdir -p ./temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Start the webhook server
CMD ["node", "dist/webhook-server.js"]
