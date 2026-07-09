// ملف: routes/systemRoutes.js
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  console.log("🔥 ROOT HIT");
  res.send("✅ Server is working");
});

module.exports = router;