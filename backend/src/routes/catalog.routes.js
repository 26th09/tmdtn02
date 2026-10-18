import { Router } from 'express'
import {
  getCategories,
  getHome,
  getProducts,
  getServiceGroups,
  searchProducts,
} from '../controllers/catalog.controller.js'
import { checkTourAvailability, getTourDetail, listTours } from '../controllers/publicTours.controller.js'
import { checkPropertyAvailability, getPropertyDetail } from '../controllers/publicProperties.controller.js'

const router = Router()

// UC-01 – không yêu cầu đăng nhập (BR-03).
router.get('/home', getHome)
router.get('/categories', getCategories)
router.get('/service-groups', getServiceGroups)
router.get('/products', getProducts)
// UC-02 – Tìm kiếm & lọc.
router.get('/search', searchProducts)
// UC-03 – Tour (bảng riêng): danh sách + chi tiết + tình trạng chỗ.
router.get('/tours', listTours)
router.get('/tours/:slug', getTourDetail)
router.get('/tours/:slug/availability', checkTourAvailability)
// UC-03 – Homestay (bảng Property): chi tiết & tình trạng còn trống theo loại phòng.
router.get('/products/:slug', getPropertyDetail)
router.get('/products/:slug/availability', checkPropertyAvailability)

export default router
