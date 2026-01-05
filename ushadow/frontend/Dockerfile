# ushadow Frontend Dockerfile
# React + Vite Dashboard

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables (baked in at build time)
ARG VITE_API_URL
ARG VITE_CHRONICLE_URL
ARG VITE_ENV_NAME

# Make build args available as env vars during build
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CHRONICLE_URL=$VITE_CHRONICLE_URL
ENV VITE_ENV_NAME=$VITE_ENV_NAME

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
