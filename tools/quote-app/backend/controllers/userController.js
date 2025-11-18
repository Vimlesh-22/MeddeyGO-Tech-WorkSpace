const mongoose = require('mongoose');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const isOfflineMode = () => {
  return (
    process.env.QUOTE_APP_OFFLINE === 'true' ||
    process.env.QUOTE_APP_DISABLE_MONGO === 'true'
  );
};

const baseOfflineUser = {
  _id: 'offline-user',
  name: 'Offline User',
  email: process.env.QUOTE_APP_OFFLINE_EMAIL,
  role: 'admin',
  defaultTemplate: 'template1',
};

const getOfflineUser = (overrides = {}) => ({
  ...baseOfflineUser,
  ...overrides,
});

const signToken = (userId) => {
  const secret = process.env.QUOTE_JWT_SECRET || process.env.JWT_SECRET;
  const expiresIn = process.env.QUOTE_JWT_EXPIRE || process.env.JWT_EXPIRE || '30d';
  
  return jwt.sign({ id: userId }, secret, {
    expiresIn: expiresIn,
  });
};

const respondWithOfflineUser = (res, overrides = {}) => {
  const user = getOfflineUser(overrides);
  return res.status(200).json({
    success: true,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      defaultTemplate: user.defaultTemplate,
      token: signToken(user._id),
    },
  });
};

// @desc    Register user
// @route   POST /api/users/register
// @access  Public
exports.registerUser = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return respondWithOfflineUser(res);
    }

    const { name, email, password, role } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists',
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: req.user?.role === 'admin' ? role : 'user', // Only admin can assign roles
    });

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: user.getSignedJwtToken(),
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return respondWithOfflineUser(res);
    }

    const { email, password } = req.body;

    console.log('=== LOGIN ATTEMPT ===');
    console.log('Email:', email);
    console.log('Password provided:', !!password);

    // Validate email & password
    if (!email || !password) {
      console.log('Missing email or password');
      return res.status(400).json({
        success: false,
        message: 'Please provide an email and password',
      });
    }

    // Check for user
    const user = await User.findOne({ email }).select('+password');
    console.log('User found:', !!user);

    if (!user) {
      console.log('User not found in database');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    console.log('Password match:', isMatch);

    if (!isMatch) {
      console.log('Password does not match');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    console.log('Login successful for:', user.email);
    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: user.getSignedJwtToken(),
      },
    });
  } catch (error) {
    console.error('=== LOGIN ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/users/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return respondWithOfflineUser(res);
    }

    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
exports.getUsers = async (req, res) => {
  try {
    if (isOfflineMode()) {
      const user = getOfflineUser();
      return res.status(200).json({
        success: true,
        count: 1,
        data: [user],
      });
    }

    const users = await User.find({});

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
exports.getUserById = async (req, res) => {
  try {
    if (isOfflineMode()) {
      const user = getOfflineUser();
      if (req.params.id && req.params.id !== user._id) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }
      return res.status(200).json({
        success: true,
        data: user,
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
exports.updateUser = async (req, res) => {
  try {
    if (isOfflineMode()) {
      const overrides = {
        name: req.body.name || baseOfflineUser.name,
        email: req.body.email || baseOfflineUser.email,
        role: req.body.role || baseOfflineUser.role,
      };
      return res.status(200).json({
        success: true,
        data: getOfflineUser(overrides),
      });
    }

    const updates = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
exports.deleteUser = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return res.status(200).json({
        success: true,
        data: {},
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all relationship managers (users with role 'manager')
// @route   GET /api/users/managers
// @access  Private
exports.getManagers = async (req, res) => {
  try {
    if (isOfflineMode()) {
      return res.status(200).json({
        success: true,
        count: 1,
        data: [getOfflineUser({ role: 'manager' })],
      });
    }

    const managers = await User.find({ role: 'manager' });

    res.status(200).json({
      success: true,
      count: managers.length,
      data: managers,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update user's default template preference
// @route   PUT /api/users/template
// @access  Private
exports.updateTemplatePreference = async (req, res) => {
  try {
    if (isOfflineMode()) {
      const { defaultTemplate } = req.body;
      return res.status(200).json({
        success: true,
        data: getOfflineUser({
          defaultTemplate: defaultTemplate || baseOfflineUser.defaultTemplate,
        }),
      });
    }

    const { defaultTemplate } = req.body;

    if (!defaultTemplate || !['template1', 'template2'].includes(defaultTemplate)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template selection. Must be template1 or template2',
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { defaultTemplate },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        defaultTemplate: user.defaultTemplate,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get available templates
// @route   GET /api/users/templates
// @access  Private
exports.getAvailableTemplates = async (req, res) => {
  try {
    const templates = [
      {
        id: 'template1',
        name: 'Classic Template',
        description: 'Clean and professional design with blue color scheme',
        preview: '/api/templates/preview/template1',
      },
      {
        id: 'template2',
        name: 'Modern Template',
        description: 'Modern design with red color scheme and enhanced layout',
        preview: '/api/templates/preview/template2',
      },
    ];

    res.status(200).json({
      success: true,
      data: templates,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
