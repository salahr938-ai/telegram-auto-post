const express = require("express");
const router = express.Router();
const referralController = require("../controllers/referralController");

// هنا فقط نربط الروابط بالوظائف
router.post("/confirm", referralController.confirmReferral);
router.post("/register", referralController.registerReferral);
router.get("/my-invites", referralController.getMyInvites);

module.exports = router;