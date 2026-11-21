const express = require("express");
const router = express.Router();
const bombController = require("../controllers/bombController");
const verifyFirebaseToken = require("../middlewares/authMiddleware");

// استلام نقاط الجولة عند الانسحاب أو إتمام المربعات الآمنة (محمي بـ Firebase Token)
router.post("/claim", verifyFirebaseToken, bombController.claimPoints);

module.exports = router;