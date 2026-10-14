const express = require('express');
const router = express.Router();
const duaController = require('../controllers/duaController');
const verifyFirebaseToken = require('../middlewares/authMiddleware'); // استدعاء موسط المصادقة الخاص بك

// 1. مسار نشر دعاء جديد (يتطلب توكن صحيح ومرتبط بإعلان المكافأة في الواجهة)
router.post('/publish', verifyFirebaseToken, duaController.publishDua);

// 2. مسار الإعجاب بدعاء (مع التحقق من حصة الإعجابات الساعية ونقاط المتفاعل)
router.post('/like', verifyFirebaseToken, duaController.likeDua);

// 3. مسار جلب قائمة الأدعية النشطة للفيض (Feed)
router.get('/feed', verifyFirebaseToken, duaController.getDuasFeed);

module.exports = router;