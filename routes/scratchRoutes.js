const express = require('express');
const router = express.Router();
// تأكد من مسار الكنترولر الخاص بك
const scratchController = require('../controllers/scratchController'); 

// هذا هو الرابط الذي سيتصل به تطبيق الأندرويد: /api/points/add-scratch
router.post('/add-scratch', scratchController.claimScratch);

module.exports = router;