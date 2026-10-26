const express = require('express');
const router = express.Router();
const suggestionController = require('../controllers/suggestionController');
const verifyFirebaseToken = require("../middlewares/authMiddleware"); // بـ s في النهاية // الـ Middleware الخاص بالتحقق من توكن الفايربيس
// مسار جلب اقتراحات المستخدم لعرضها في التطبيق
router.get('/my', verifyFirebaseToken, suggestionController.getMySuggestions);
// مسار إرسال اقتراح جديد (محمي بـ Auth)
router.post('/', verifyFirebaseToken, suggestionController.createSuggestion);
router.post('/claim-bonus', verifyFirebaseToken, suggestionController.claimAdBonus);

module.exports = router;