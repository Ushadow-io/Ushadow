# syntax=docker/dockerfile:1.7
# Production image for the Chronicle web UI.
#
# Upstream Chronicle removed its production webui Dockerfile and nginx.conf
# (chronicle@07e194ee, Jul 2026) and only ships Dockerfile.dev. This is the
# last upstream version, updated for the current layout: the webui lives in
# backend/webui and depends on contracts/audio/v2/typescript via a file: path,
# so the build context is the chronicle repo root.
#
# Build: docker buildx build -f docker/chronicle-webui/Dockerfile chronicle
# Only the paths listed in Dockerfile.dockerignore are sent to the builder.

FROM node:22-alpine AS build

WORKDIR /workspace/backend/webui

# Keep the repo layout so package.json's ../../contracts path resolves.
COPY contracts/audio/v2/typescript /workspace/contracts/audio/v2/typescript
COPY backend/webui/package.json backend/webui/package-lock.json ./
RUN npm ci

COPY backend/webui/ .

ARG VITE_ALLOWED_HOSTS
ENV VITE_ALLOWED_HOSTS=${VITE_ALLOWED_HOSTS}
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}

# prebuild installs the contracts package, then tsc && vite build
RUN npm run build

FROM nginx:alpine AS production

COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html index.htm;

    client_max_body_size 100M;

    gzip on;
    gzip_vary on;
    gzip_min_length 10240;
    gzip_proxied any;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    # Prevent stale index.html after deployments
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
}
EOF

COPY --from=build /workspace/backend/webui/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
