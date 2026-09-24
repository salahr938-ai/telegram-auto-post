const express = require("express");
const router = express.Router();
const referralController = require("../controllers/referralController");

// 🛡️ ربط كل مسار بدالة التحقق من التوكن (verifyToken) الموجودة في الكنترولر أولاً
router.post("/confirm", referralController.verifyToken, referralController.confirmReferral);
router.post("/register", referralController.verifyToken, referralController.registerReferral);
router.get("/my-invites", referralController.verifyToken, referralController.getMyInvites);

module.exports = router;