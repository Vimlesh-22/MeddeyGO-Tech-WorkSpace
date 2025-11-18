const express = require('express');
const {
  registerUser,
  loginUser,
  getMe,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getManagers,
  updateTemplatePreference,
  getAvailableTemplates,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/register', protect, authorize('admin'), registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.get('/managers', protect, getManagers);
router.get('/templates', protect, getAvailableTemplates);
router.put('/template', protect, updateTemplatePreference);
router.get('/', protect, authorize('admin'), getUsers);
router.get('/:id', protect, authorize('admin'), getUserById);
router.put('/:id', protect, authorize('admin'), updateUser);
router.delete('/:id', protect, authorize('admin'), deleteUser);

module.exports = router; 