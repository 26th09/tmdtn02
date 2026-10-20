# ---- Frontend (React + Vite) build, phục vụ bằng nginx ----
FROM node:20-alpine AS build
WORKDIR /app

# URL API được nhúng vào bản build (client gọi trực tiếp). Mặc định cho demo local.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Phục vụ tĩnh (HTTP :80 chuyển hướng + HTTPS :443) ----
FROM nginx:alpine

# Chứng chỉ TỰ KÝ sinh ngay lúc build (luôn có sẵn -> clone sạch vẫn chạy).
# SSL_SAN liệt kê các tên/IP hợp lệ; truyền IP LAN qua đây để trình duyệt máy khác
# chấp nhận (vẫn là self-signed nên có cảnh báo 1 lần). Vd:
#   SSL_SAN="DNS:localhost,IP:127.0.0.1,IP:192.168.1.50"
ARG SSL_SAN="DNS:localhost,IP:127.0.0.1"
RUN apk add --no-cache openssl && mkdir -p /etc/nginx/certs && \
    openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout /etc/nginx/certs/server.key -out /etc/nginx/certs/server.crt \
      -subj "/CN=StayTour" -addext "subjectAltName=${SSL_SAN}"

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80 443
