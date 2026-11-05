const express = require("express");
const router = express.Router();
const match3Controller = require("../controllers/match3Controller");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

// مسار تحديث نقاط لعبة المطابقة (محمي بـ Firebase Token)
router.post("/update-score", verifyFirebaseToken, match3Controller.updateScore);

// فحص هل المستوى مسموح باللعب (محمي بـ Firebase Token)
router.post("/check-level", verifyFirebaseToken, match3Controller.checkLevelStatus);

module.exports = router;
