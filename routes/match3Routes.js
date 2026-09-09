const express = require("express");
const router = express.Router();
const match3Controller = require("../controllers/match3Controller");

// مسار تحديث نقاط لعبة المطابقة
router.post("/update-score", match3Controller.updateScore);
router.post("/check-level", match3Controller.checkLevelStatus);

module.exports = router;