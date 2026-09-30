// routes/referralRoutes.js
const express = require("express");
const router = express.Router();
const verifyFirebaseToken = require("../middlewares/authMiddleware");
const { registerReferral, getMyInvites } = require("../controllers/referralController");

router.post("/register", verifyFirebaseToken, registerReferral);
router.get("/my-invites", verifyFirebaseToken, getMyInvites);

module.exports = router;