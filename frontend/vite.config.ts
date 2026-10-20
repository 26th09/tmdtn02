import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// HTTPS ở dev (chứng chỉ tự ký qua basic-ssl) để biểu mẫu thẻ Stripe chạy trên kết nối bảo mật
// — tắt cảnh báo "biểu mẫu không dùng kết nối bảo mật" và bật tự động điền an toàn.
export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  server: {
    port: 5173,
  },
})
