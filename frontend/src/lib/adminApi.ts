// UC-24 (BR-67) – API client RIÊNG cho khu vực quản trị: token admin không bao giờ
// đi qua cùng một biến/hàm với api.ts của Customer, tránh dùng lẫn giữa hai bên.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export class AdminApiError extends Error {
  status: number
  code?: string
  body?: unknown // toàn bộ JSON lỗi trả về (vd: chi tiết xung đột 409 ở UC-16 BR-75)
  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

let adminToken: string | null = null
export function setAdminToken(token: string | null) {
  adminToken = token
}

// Xử lý phiên quản trị hết hạn/không hợp lệ (401): do AdminAuthProvider đăng ký để đăng xuất + về login.
let onAdminUnauthorized: () => void = () => {}
export function setAdminUnauthorizedHandler(fn: () => void) {
  onAdminUnauthorized = fn
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (adminToken) headers.set('Authorization', `Bearer ${adminToken}`)
  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    let message = `Yêu cầu thất bại (${res.status})`
    let code: string | undefined
    let body: unknown
    try {
      body = await res.json()
      const b = body as { message?: string; code?: string }
      if (b?.message) message = b.message
      if (b?.code) code = b.code
    } catch {
      // giữ message mặc định
    }
    // Phiên hết hạn/không hợp lệ ở BẤT KỲ thao tác nào (trừ các bước xác thực /admin/auth/*) -> đăng xuất + về login.
    if (res.status === 401 && !path.includes('/admin/auth/')) {
      adminToken = null
      onAdminUnauthorized()
    }
    throw new AdminApiError(res.status, message, code, body)
  }
  return res.json() as Promise<T>
}

const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export interface AdminInfo {
  id: number
  username: string
  name: string | null
  role: 'SUPER_ADMIN' | 'MANAGER'
  email?: string | null
}

export interface AdminSession {
  token: string
  admin: AdminInfo
}
// Bước 1 đăng nhập / kích hoạt: đã đúng mật khẩu, chờ nhập OTP 2FA.
export interface AdminOtpChallenge {
  otpRequired: true
  challenge: string
  sentTo: string | null
}
// Sau khi vượt OTP mà mật khẩu cần đổi (lần đầu / hết hạn).
export interface AdminPwChangeRequired {
  requirePasswordChange: true
  reason: 'FIRST_LOGIN' | 'EXPIRED'
  changeToken: string
}
export type AdminVerifyResult = AdminSession | AdminPwChangeRequired

export interface AdminAccount {
  id: number
  username: string
  email: string | null
  name: string | null
  role: 'SUPER_ADMIN' | 'MANAGER'
  active: boolean
  activated: boolean
  mustChangePassword: boolean
  passwordChangedAt: string
  passwordDaysLeft: number
  createdAt: string
}

const putReq = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const patchReq = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })

export interface AdminPropertyCat { id: number; name: string; kind?: string | null }
export interface AdminAmenity { id: number; name: string; icon: string | null; scope: string }
export interface AdminRoomType {
  id: number
  name: string
  roomSize: number | null
  bedType: string | null
  maxOccupancy: number
  totalRooms: number
  breakfastIncluded: boolean
  smokingAllowed: boolean
  basePricePerNight: number
  description: string | null
  _count?: { inventory: number }
}

export interface AdminProduct {
  id: number
  name: string
  slug: string
  propertyCode: string
  propertyType: string
  status: 'DRAFT' | 'VISIBLE' | 'HIDDEN'
  address: string | null
  basePrice: number
  thumbnail: string | null
  starRating: number | null
  province?: { name: string } | null
  area?: { name: string } | null
  _count?: { roomTypes: number }
  updatedAt: string
}

export interface AdminProductDetail extends AdminProduct {
  shortDescription: string | null
  description: string | null
  provinceId: number | null
  areaId: number | null
  latitude: number | null
  longitude: number | null
  checkInTime: string | null
  checkOutTime: string | null
  depositRate: number | null
  isPeakSeason?: boolean
  cancellationPolicyId: number | null
  contactPhone: string | null
  contactEmail: string | null
  metaTitle: string | null
  metaDescription: string | null
  images: { id: number; url: string; caption: string | null; isCover: boolean; sortOrder: number }[]
  amenities: { amenity: AdminAmenity }[]
  policies: { id: number; type: string; title: string | null; content: string }[]
  roomTypes: AdminRoomType[]
}

export interface InventoryDay {
  date: string
  totalRooms: number
  bookedRooms: number
  heldRooms: number
  priceOverride: number | null
  isBlocked: boolean
  saved: boolean
}

export const adminApi = {
  // UC-24 – Đăng nhập 2 bước (mật khẩu -> OTP 2FA), kích hoạt lần đầu, đổi mật khẩu.
  login: (username: string, password: string) => post<AdminOtpChallenge>('/api/admin/auth/login', { username, password }),
  verifyOtp: (challenge: string, otp: string) => post<AdminVerifyResult>('/api/admin/auth/verify-otp', { challenge, otp }),
  changeAdminPassword: (changeToken: string, newPassword: string) =>
    post<AdminSession>('/api/admin/auth/change-password', { changeToken, newPassword }),
  activationContext: (token: string) => get<{ username: string; email: string | null }>(`/api/admin/auth/activate/${token}`),
  activate: (token: string, username: string, password: string) =>
    post<AdminOtpChallenge>('/api/admin/auth/activate', { token, username, password }),
  me: () =>
    get<{ admin: AdminInfo; password: { expiresAt: string; daysLeft: number } }>('/api/admin/auth/me'),
  forgotPassword: (email: string) => post<{ message: string }>('/api/admin/auth/forgot-password', { email }),
  resetContext: (token: string) => get<{ email: string | null; username: string }>(`/api/admin/auth/reset-password/${token}`),
  resetPassword: (token: string, otp: string, newPassword: string) =>
    post<{ message: string }>('/api/admin/auth/reset-password', { token, otp, newPassword }),

  // Quản lý tài khoản admin (chỉ SUPER_ADMIN)
  listAdmins: () => get<{ items: AdminAccount[] }>('/api/admin/admins'),
  createAdmin: (data: { username: string; email: string; name?: string; role: string }) =>
    post<{ item: AdminAccount }>('/api/admin/admins', data),
  resendAdminActivation: (id: number) => post<{ ok: boolean }>(`/api/admin/admins/${id}/resend-activation`, {}),
  setAdminActive: (id: number, active: boolean) => patchReq<{ ok: boolean }>(`/api/admin/admins/${id}/active`, { active }),

  // UC-16 – Quản lý homestay
  listHomestays: (params: { status?: string; search?: string; group?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.search) qs.set('search', params.search)
    if (params.group) qs.set('group', String(params.group))
    return get<{ items: AdminProduct[] }>(`/api/admin/homestays?${qs.toString()}`)
  },
  getHomestay: (id: number) => get<{ property: AdminProductDetail }>(`/api/admin/homestays/${id}`),
  createHomestay: (data: Record<string, unknown>) => post<{ property: AdminProductDetail }>('/api/admin/homestays', data),
  updateHomestay: (id: number, data: Record<string, unknown>) =>
    putReq<{ property: AdminProductDetail }>(`/api/admin/homestays/${id}`, data),
  setHomestayVisibility: (id: number, status: 'DRAFT' | 'VISIBLE' | 'HIDDEN') =>
    patchReq<{ property: AdminProduct; warning: { message: string; bookings: unknown[] } | null }>(
      `/api/admin/homestays/${id}/visibility`,
      { status },
    ),
  getHomestayMeta: () => get<{ provinces: AdminPropertyCat[]; areas: AdminPropertyCat[]; amenities: AdminAmenity[]; policies: { id: number; name: string }[] }>('/api/admin/homestays/meta'),
  createHomestayCategory: (kind: 'province' | 'area', name: string) =>
    post<{ category: AdminPropertyCat }>('/api/admin/homestays/categories', { kind, name }),
  uploadImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_URL}/api/admin/homestays/uploads/image`, {
      method: 'POST',
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new AdminApiError(res.status, body.message || 'Tải ảnh thất bại')
    }
    return res.json() as Promise<{ filename: string; url: string }>
  },
  addImage: (propertyId: number, filename: string) =>
    post<{ image: { id: number; url: string } }>(`/api/admin/homestays/${propertyId}/images`, { filename }),
  removeImage: (propertyId: number, imageId: number) =>
    del<{ ok: boolean }>(`/api/admin/homestays/${propertyId}/images/${imageId}`),
  // Loại phòng
  createRoomType: (propertyId: number, data: Record<string, unknown>) =>
    post<{ roomType: AdminRoomType }>(`/api/admin/homestays/${propertyId}/room-types`, data),
  updateRoomType: (propertyId: number, rtId: number, data: Record<string, unknown>) =>
    putReq<{ roomType: AdminRoomType }>(`/api/admin/homestays/${propertyId}/room-types/${rtId}`, data),
  deleteRoomType: (propertyId: number, rtId: number) =>
    del<{ ok: boolean }>(`/api/admin/homestays/${propertyId}/room-types/${rtId}`),
  // Lịch tồn phòng theo loại phòng
  getInventory: (propertyId: number, rtId: number, from: string, to: string) =>
    get<{ basePrice: number; calendar: InventoryDay[] }>(`/api/admin/homestays/${propertyId}/room-types/${rtId}/inventory?from=${from}&to=${to}`),
  setInventory: (propertyId: number, rtId: number, data: { from: string; to: string; totalRooms: number; priceOverride?: number | null; isBlocked?: boolean }) =>
    putReq<{ ok: boolean; days: number }>(`/api/admin/homestays/${propertyId}/room-types/${rtId}/inventory`, data),

  // UC-17 – Quản lý tour (bảng riêng)
  listTours: (params: { status?: string; search?: string; group?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.search) qs.set('search', params.search)
    if (params.group) qs.set('group', String(params.group))
    return get<{ items: AdminTour[] }>(`/api/admin/tours?${qs.toString()}`)
  },
  getTour: (id: number) => get<{ tour: AdminTourDetail }>(`/api/admin/tours/${id}`),
  createTour: (data: Record<string, unknown>) => post<{ tour: AdminTourDetail }>('/api/admin/tours', data),
  updateTour: (id: number, data: Record<string, unknown>) => putReq<{ tour: AdminTourDetail }>(`/api/admin/tours/${id}`, data),
  setTourVisibility: (id: number, status: 'DRAFT' | 'VISIBLE' | 'HIDDEN') =>
    patchReq<{ tour: AdminTour; warning: { message: string; bookings: unknown[] } | null }>(
      `/api/admin/tours/${id}/visibility`,
      { status },
    ),
  getTourCategories: () => get<{ regions: AdminTourCat[]; themes: AdminTourCat[]; durations: AdminTourCat[]; policies: { id: number; name: string }[] }>('/api/admin/tours/categories'),
  createTourCategory: (kind: 'region' | 'theme', name: string) =>
    post<{ category: AdminTourCat }>('/api/admin/tours/categories', { kind, name }),
  uploadTourImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_URL}/api/admin/tours/uploads/image`, {
      method: 'POST',
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new AdminApiError(res.status, body.message || 'Tải ảnh thất bại')
    }
    return res.json() as Promise<{ filename: string; url: string }>
  },
  addTourImage: (tourId: number, filename: string) =>
    post<{ image: TourImage }>(`/api/admin/tours/${tourId}/images`, { filename }),
  removeTourImage: (tourId: number, imageId: number) =>
    del<{ ok: boolean }>(`/api/admin/tours/${tourId}/images/${imageId}`),
  createDeparture: (tourId: number, data: { date: string; totalSlots: number; priceAdult?: number | null; priceChild?: number | null; priceInfant?: number | null; guideName?: string }) =>
    post<{ departure: Departure }>(`/api/admin/tours/${tourId}/departures`, data),
  updateDeparture: (
    tourId: number,
    depId: number,
    data: { totalSlots?: number; priceAdult?: number | null; priceChild?: number | null; guideName?: string },
  ) => putReq<{ departure: Departure }>(`/api/admin/tours/${tourId}/departures/${depId}`, data),
  closeDeparture: (tourId: number, depId: number) =>
    patchReq<{ departure: Departure }>(`/api/admin/tours/${tourId}/departures/${depId}/close`, {}),

  // Cẩm nang du lịch (quản trị)
  listGuides: (params: { status?: string; search?: string; group?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.search) qs.set('search', params.search)
    if (params.group) qs.set('group', String(params.group))
    return get<{ items: AdminGuideListItem[] }>(`/api/admin/guides?${qs.toString()}`)
  },
  getGuide: (id: number) => get<{ guide: AdminGuideDetail }>(`/api/admin/guides/${id}`),
  getGuideMeta: () =>
    get<{ tours: { id: number; title: string; slug: string }[]; groups: { tree: ServiceGroup[]; flat: ServiceGroup[] } }>('/api/admin/guides/meta'),
  createGuide: (data: Record<string, unknown>) => post<{ guide: AdminGuideDetail }>('/api/admin/guides', data),
  updateGuide: (id: number, data: Record<string, unknown>) => putReq<{ guide: AdminGuideDetail }>(`/api/admin/guides/${id}`, data),
  setGuideVisibility: (id: number, status: 'DRAFT' | 'VISIBLE' | 'HIDDEN') =>
    patchReq<{ guide: AdminGuideListItem }>(`/api/admin/guides/${id}/visibility`, { status }),
  deleteGuide: (id: number) => del<{ ok: boolean }>(`/api/admin/guides/${id}`),
  uploadGuideImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_URL}/api/admin/guides/uploads/image`, {
      method: 'POST',
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new AdminApiError(res.status, body.message || 'Tải ảnh thất bại')
    }
    return res.json() as Promise<{ filename: string; url: string }>
  },

  // UC-18 – Quản lý đơn & xử lý hủy/hoàn tiền
  listOrders: (params: { status?: string; type?: string; from?: string; to?: string; search?: string; minTotal?: string; maxTotal?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.type) qs.set('type', params.type)
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    if (params.search) qs.set('search', params.search)
    if (params.minTotal) qs.set('minTotal', params.minTotal)
    if (params.maxTotal) qs.set('maxTotal', params.maxTotal)
    return get<{ items: AdminOrder[] }>(`/api/admin/orders?${qs.toString()}`)
  },
  bulkUpdateOrderStatus: (rows: { code: string; status: string }[]) =>
    post<{ updatedCount: number; total: number; results: { code: string; ok: boolean; message: string; skipped?: boolean }[] }>(
      '/api/admin/orders/bulk-status',
      { rows },
    ),
  getOrder: (code: string) =>
    get<{ order: AdminOrderDetail; payments: AdminPayment[]; refundRequests: AdminRefundRequest[] }>(
      `/api/admin/orders/${code}`,
    ),
  updateOrderStatus: (code: string, status: string) =>
    patchReq<{ order: AdminOrderDetail }>(`/api/admin/orders/${code}/status`, { status }),
  setOrderPayment: (code: string, body: { mark?: 'FULL' | 'DEPOSIT' | 'NONE'; paidAmount?: number }) =>
    patchReq<{ ok: boolean; paidAmount: number; paymentState: string; outstanding: number }>(`/api/admin/orders/${code}/payment`, body),
  processRefund: (code: string, refundId: number, data: { amount?: number; referenceCode?: string }) =>
    post<{ refund: AdminRefundRequest }>(`/api/admin/orders/${code}/refunds/${refundId}/process`, data),

  // UC-19 – Quản lý người dùng & phân quyền
  listCustomers: (params: { status?: string; search?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.search) qs.set('search', params.search)
    return get<{ items: AdminCustomer[] }>(`/api/admin/users/customers?${qs.toString()}`)
  },
  getCustomer: (id: number) =>
    get<{ user: AdminCustomerDetail; activeBookings: { code: string; status: string; type: string }[] }>(
      `/api/admin/users/customers/${id}`,
    ),
  setCustomerLock: (id: number, disabled: boolean) =>
    patchReq<{ user: { id: number; disabled: boolean }; warning: { message: string; bookings: unknown[] } | null }>(
      `/api/admin/users/customers/${id}/lock`,
      { disabled },
    ),
  // (Quản lý tài khoản admin đã chuyển sang luồng bảo mật /api/admin/admins — xem phần trên.)

  // UC-20 – Quản lý mã khuyến mại
  listDiscounts: (params: { status?: string; search?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.search) qs.set('search', params.search)
    return get<{ items: AdminDiscount[] }>(`/api/admin/discounts?${qs.toString()}`)
  },
  getDiscount: (id: number) => get<{ item: AdminDiscount }>(`/api/admin/discounts/${id}`),
  createDiscount: (data: Record<string, unknown>) => post<{ item: AdminDiscount }>('/api/admin/discounts', data),
  updateDiscount: (id: number, data: Record<string, unknown>) => putReq<{ item: AdminDiscount }>(`/api/admin/discounts/${id}`, data),
  setDiscountActive: (id: number, active: boolean) =>
    patchReq<{ item: AdminDiscount }>(`/api/admin/discounts/${id}/active`, { active }),

  // UC-21 – Kiểm duyệt đánh giá
  listReviews: (params: { status?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    return get<{ items: AdminReview[] }>(`/api/admin/reviews?${qs.toString()}`)
  },
  approveReview: (id: number) => patchReq<{ item: AdminReview }>(`/api/admin/reviews/${id}/approve`, {}),
  rejectReview: (id: number) => patchReq<{ item: AdminReview }>(`/api/admin/reviews/${id}/reject`, {}),
  replyReview: (id: number, message: string) =>
    post<{ item: { id: number; replyText: string | null; repliedAt: string | null }; sentTo: string }>(
      `/api/admin/reviews/${id}/reply`,
      { message },
    ),
  topRatedTours: (limit = 10) =>
    get<{ items: TopRatedTour[] }>(`/api/admin/reviews/top-tours?limit=${limit}`),

  // Nhóm dịch vụ (cây phân cấp)
  listServiceGroups: () => get<{ tree: ServiceGroup[]; flat: ServiceGroup[] }>('/api/admin/service-groups'),
  createServiceGroup: (data: { name: string; parentId?: number | null; description?: string }) =>
    post<{ group: ServiceGroup }>('/api/admin/service-groups', data),
  updateServiceGroup: (id: number, data: Record<string, unknown>) =>
    patchReq<{ group: ServiceGroup }>(`/api/admin/service-groups/${id}`, data),
  deleteServiceGroup: (id: number) => del<{ ok: boolean }>(`/api/admin/service-groups/${id}`),
  getServiceGroupMembers: (id: number) => get<ServiceGroupMembers>(`/api/admin/service-groups/${id}/members`),
  addServiceGroupItem: (id: number, kind: 'tour' | 'property' | 'guide', itemId: number) =>
    post<{ ok: boolean }>(`/api/admin/service-groups/${id}/items`, { kind, itemId }),
  removeServiceGroupItem: (id: number, kind: 'tour' | 'property' | 'guide', itemId: number) =>
    del<{ ok: boolean }>(`/api/admin/service-groups/${id}/items/${kind}/${itemId}`),

  // Liên hệ & chăm sóc khách hàng
  listContacts: (params: { status?: string; type?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    if (params.type) qs.set('type', params.type)
    return get<{ items: ContactMessage[]; counts: ContactCounts }>(`/api/admin/contacts?${qs.toString()}`)
  },
  getContact: (id: number) => get<{ item: ContactMessage }>(`/api/admin/contacts/${id}`),
  setContactStatus: (id: number, status: string) =>
    patchReq<{ item: ContactMessage }>(`/api/admin/contacts/${id}/status`, { status }),
  listSentReplies: () => get<{ items: ContactReply[] }>('/api/admin/contacts/sent'),
  replyContact: async (id: number, body: string, files: File[]) => {
    const form = new FormData()
    form.append('body', body)
    files.forEach((f) => form.append('files', f))
    const res = await fetch(`${API_URL}/api/admin/contacts/${id}/reply`, {
      method: 'POST',
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
      body: form,
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      throw new AdminApiError(res.status, b.message || 'Gửi trả lời thất bại')
    }
    return res.json() as Promise<{ reply: ContactReply }>
  },

  // Đăng ký nhận ưu đãi (quản lý trong mục Chăm sóc khách hàng)
  listSubscribers: (params: { status?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    return get<{ items: NewsletterSubscriber[]; counts: SubscriberCounts }>(`/api/admin/newsletter?${qs.toString()}`)
  },
  setSubscriberStatus: (id: number, status: string) =>
    patchReq<{ item: NewsletterSubscriber }>(`/api/admin/newsletter/${id}/status`, { status }),
  deleteSubscriber: (id: number) => del<{ ok: boolean }>(`/api/admin/newsletter/${id}`),

  // UC-22 – Báo cáo & thống kê
  getReports: (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    return get<AdminReports>(`/api/admin/reports?${qs.toString()}`)
  },

  // UC-23 – Cấu hình hệ thống & nhật ký
  getSystemConfig: () => get<{ config: AdminSystemConfig }>('/api/admin/config'),
  updateSystemConfig: (data: Partial<AdminSystemConfig>) => putReq<{ config: AdminSystemConfig }>('/api/admin/config', data),
  listAuditLogs: (params: { action?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.action) qs.set('action', params.action)
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    return get<{ items: AdminAuditLogEntry[]; loginAttempts: AdminLoginAttemptEntry[] }>(`/api/admin/config/audit-logs?${qs.toString()}`)
  },

  // Quản lý chương trình khuyến mại (banner trang chủ)
  listPromotions: (params: { status?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.status) qs.set('status', params.status)
    return get<{ items: AdminPromotion[] }>(`/api/admin/promotions?${qs.toString()}`)
  },
  getPromotion: (id: number) => get<{ item: AdminPromotion }>(`/api/admin/promotions/${id}`),
  createPromotion: (data: { title: string; description?: string; image?: string; active?: boolean }) =>
    post<{ item: AdminPromotion }>('/api/admin/promotions', data),
  updatePromotion: (id: number, data: { title: string; description?: string; image?: string; active?: boolean }) =>
    putReq<{ item: AdminPromotion }>(`/api/admin/promotions/${id}`, data),
  setPromotionActive: (id: number, active: boolean) =>
    patchReq<{ item: AdminPromotion }>(`/api/admin/promotions/${id}/active`, { active }),
  deletePromotion: (id: number) => del<{ ok: boolean }>(`/api/admin/promotions/${id}`),
  uploadPromotionImage: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${API_URL}/api/admin/promotions/uploads/image`, {
      method: 'POST',
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : undefined,
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new AdminApiError(res.status, body.message || 'Tải ảnh thất bại')
    }
    return res.json() as Promise<{ filename: string; url: string }>
  },
}

export interface AdminPromotion {
  id: number
  title: string
  description: string | null
  image: string | null
  active: boolean
  startAt: string | null
  endAt: string | null
  discountCode: string | null
  discountPercent: number | null
  serviceGroupId: number | null
  serviceGroup?: { id: number; name: string } | null
  ctaLink: string | null
  createdAt: string
}

export interface AdminSystemConfig {
  id: number
  depositRatePercent: number
  cancelFreeHours: number
  cancelTier1Days: number
  cancelTier1Ratio: number
  cancelTier2Days: number
  cancelTier2Ratio: number
  cancelTier3Days: number
  cancelTier3Ratio: number
  vnpayEnabled: boolean
  payOnDepartureEnabled: boolean
  vatPercent: number
  fullPaymentHoursBeforeStart: number
  codDueDays: number
  payOnDepartureMinHours: number
  sellerName: string | null
  sellerAddress: string | null
  sellerPhone: string | null
  sellerEmail: string | null
  siteNotice: string | null
  updatedAt: string
}

export interface AdminAuditLogEntry {
  id: number
  type: 'ACTION'
  action: string
  adminUsername?: string
  entityType: string | null
  entityId: number | null
  detail: string | null
  createdAt: string
}

export interface AdminLoginAttemptEntry {
  id: number
  type: 'LOGIN'
  username: string
  success: boolean
  reason: string | null
  ip: string | null
  createdAt: string
}

export interface AdminReports {
  range: { from: string; to: string }
  revenue: { gross: number; refunded: number; net: number; vatPercent?: number; tax?: number; afterTax?: number; byDay: { date: string; amount: number }[] }
  ordersByStatus: { status: string; count: number }[]
  topTours: { productId: number; name?: string; slug?: string; bookingsCount: number; seats: number }[]
  homestayOccupancy: { productId: number; name?: string; slug?: string; totalRoomNights: number; bookedRoomNights: number; rate: number }[]
  revenueByGroup?: { id: number; name: string; amount: number }[]
}

export interface ContactAttachment {
  url: string
  name: string
  type: string
}
export interface ContactReply {
  id: number
  messageId: number
  adminId: number | null
  body: string
  attachments: ContactAttachment[] | null
  toEmail: string
  sentAt: string
  message?: { id: number; name: string; email: string; subject: string | null; type: string }
}
export interface ContactMessage {
  id: number
  type: 'CUSTOMER' | 'PARTNER'
  name: string
  email: string
  phone: string | null
  subject: string | null
  body: string
  bookingCode: string | null
  status: 'UNREAD' | 'READ' | 'REPLIED' | 'ARCHIVED'
  readAt: string | null
  repliedAt: string | null
  createdAt: string
  _count?: { replies: number }
  replies?: ContactReply[]
}
export interface ContactCounts {
  unread: number
  total: number
  replied: number
}

export interface NewsletterSubscriber {
  id: number
  email: string
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED'
  source: string | null
  createdAt: string
  unsubscribedAt: string | null
}
export interface SubscriberCounts {
  subscribed: number
  total: number
}

export interface ServiceGroup {
  id: number
  name: string
  slug: string
  description: string | null
  order: number
  parentId: number | null
  children?: ServiceGroup[]
  _count?: { tours: number; properties: number; guides: number }
}
export interface ServiceGroupMembers {
  group: ServiceGroup
  members: { tours: { id: number; title: string }[]; properties: { id: number; name: string }[]; guides: { id: number; title: string }[] }
  options: { tours: { id: number; title: string }[]; properties: { id: number; name: string }[]; guides: { id: number; title: string }[] }
}

export interface TopRatedTour {
  id: number
  title: string
  slug: string
  avgRating: number
  reviewCount: number
}

export interface AdminReview {
  id: number
  productId: number
  bookingId: number | null
  authorName: string
  rating: number
  comment: string | null
  approved: boolean
  rejected: boolean
  replyText: string | null
  repliedAt: string | null
  createdAt: string
  product?: { name: string; slug: string }
  reviewer?: { name: string; email: string | null; isGuest: boolean | null }
  booking?: { code: string; type: string; guestName: string; guestEmail: string } | null
}

export interface AdminDiscount {
  id: number
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  minOrderValue: number
  scope: 'ALL' | 'HOMESTAY' | 'TOUR'
  productId: number | null
  product?: { name: string; slug: string } | null
  serviceGroupId: number | null
  serviceGroup?: { id: number; name: string } | null
  audience: 'ALL' | 'CUSTOMER'
  startAt: string | null
  endAt: string | null
  maxUses: number | null
  usedCount: number
  active: boolean
  createdAt: string
}

export interface AdminCustomer {
  id: number
  email: string
  name: string | null
  phone: string | null
  disabled: boolean
  emailVerified: boolean
  createdAt: string
  _count: { bookings: number }
}

export interface AdminCustomerDetail {
  id: number
  email: string
  name: string | null
  phone: string | null
  address: string | null
  disabled: boolean
  emailVerified: boolean
  googleId: string | null
  createdAt: string
}

export interface AdminOrder {
  code: string
  type: 'HOMESTAY' | 'TOUR'
  status: 'PENDING_DEPOSIT' | 'DEPOSITED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
  productName: string
  productSlug: string
  guestName: string
  guestEmail: string
  guestPhone: string
  checkIn: string | null
  checkOut: string | null
  guests: number
  children: number
  totalPrice: number
  depositAmount: number
  remainingAmount: number
  discountAmount?: number
  paymentMethod: string | null
  paymentStatus?: 'UNPAID' | 'AUTHORIZED' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED'
  cardAuthAmount?: number | null
  paidAmount: number
  payable: number
  paymentState: 'UNPAID' | 'PARTIAL' | 'PAID'
  outstanding: number
  contactComplete: boolean
  refundRatio: number | null
  refundAmount: number | null
  createdAt: string
}

export interface AdminOrderDetail extends AdminOrder {
  nights: number | null
  note: string | null
  discountCode: string | null
  discountAmount: number
  transactionId: string | null
  depositPaidAt: string | null
  cancelledAt: string | null
  allowedTransitions: string[]
  fullPaymentDeadline: string | null
  codDeadline: string | null
}

export interface AdminPayment {
  id: number
  method: string
  amount: number
  status: string
  transactionId: string | null
  createdAt: string
}

export interface AdminRefundRequest {
  id: number
  bookingId: number
  amount: number
  ratio: number
  status: string
  createdAt: string
}

export interface AdminTourCat {
  id: number
  name: string
  kind: string | null
}

export interface AdminTour {
  id: number
  title: string
  slug: string
  tourCode: string
  status: 'DRAFT' | 'VISIBLE' | 'HIDDEN'
  destination: string | null
  departurePoint: string | null
  basePrice: number
  durationDays: number
  durationNights: number
  thumbnail: string | null
  region?: { name: string } | null
  theme?: { name: string } | null
  updatedAt: string
}

export interface TourImage {
  id: number
  url: string
  caption: string | null
  isCover: boolean
  sortOrder: number
}

export interface DeparturePrice {
  id: number
  paxType: 'ADULT' | 'CHILD' | 'INFANT'
  price: number
  description: string | null
}

export interface Departure {
  id: number
  tourId: number
  departureDate: string
  returnDate: string | null
  totalSlots: number
  bookedSlots: number
  heldSlots: number
  status: 'OPEN' | 'CLOSED' | 'FULL' | 'CANCELLED'
  guideName: string | null
  prices: DeparturePrice[]
}

export interface AdminTourDetail extends AdminTour {
  shortDescription: string | null
  description: string | null
  highlights: string | null
  regionId: number | null
  themeId: number | null
  meetingPoint: string | null
  minPax: number
  maxPax: number
  guideLanguage: string | null
  depositRate: number | null
  isPeakSeason?: boolean
  cancellationPolicyId: number | null
  metaTitle: string | null
  metaDescription: string | null
  images: TourImage[]
  itinerary: { id: number; dayNumber: number; title: string | null; description: string | null; meals: string | null; accommodation: string | null }[]
  inclusions: { id: number; type: 'INCLUDED' | 'EXCLUDED'; itemText: string }[]
  notes: { id: number; type: 'TERM' | 'FAQ' | 'REDEMPTION'; title: string | null; content: string }[]
  departures: Departure[]
}

// Cẩm nang du lịch (quản trị)
export interface AdminGuideListItem {
  id: number
  title: string
  slug: string
  authorName: string | null
  coverImage: string | null
  locationName: string | null
  publishedAt: string | null
  status: 'DRAFT' | 'VISIBLE' | 'HIDDEN'
  updatedAt: string
  _count?: { relatedTours: number }
}

export interface AdminGuideDetail {
  id: number
  title: string
  slug: string
  authorName: string | null
  coverImage: string | null
  excerpt: string | null
  content: string
  locationName: string | null
  latitude: number | null
  longitude: number | null
  publishedAt: string | null
  status: 'DRAFT' | 'VISIBLE' | 'HIDDEN'
  relatedTours: { guideId: number; tourId: number; tour: { id: number; title: string; slug: string } }[]
  groupIds?: number[]
}
