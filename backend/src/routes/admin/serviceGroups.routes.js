import { Router } from 'express'
import { listGroups, createGroup, updateGroup, deleteGroup, getGroupMembers, addItem, removeItem } from '../../controllers/admin/serviceGroups.controller.js'
import { requireAdmin } from '../../middleware/adminAuth.middleware.js'

const router = Router()
router.use(requireAdmin)

router.get('/', listGroups)
router.post('/', createGroup)
router.get('/:id/members', getGroupMembers)
router.post('/:id/items', addItem)
router.delete('/:id/items/:kind/:itemId', removeItem)
router.patch('/:id', updateGroup)
router.delete('/:id', deleteGroup)

export default router
