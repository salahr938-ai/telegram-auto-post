const express = require('express');
const router = express.Router();
const suggestionController = require('../controllers/suggestionController');
const verifyFirebaseToken = require('../middleware/authMiddleware'); // الـ Middleware الخاص بالتحقق من توكن الفايربيس

// مسار إرسال اقتراح جديد (محمي بـ Auth)
router.post('/', verifyFirebaseToken, suggestionController.createSuggestion);

module.exports = router;