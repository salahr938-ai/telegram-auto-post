const express = require("express");
const router = express.Router();
const {
  requestUploadUrl,
  createVideoRecord,
  listVideos,
} = require("../controllers/r2Video.controller");

router.post("/upload-url", requestUploadUrl);
router.post("/", createVideoRecord);
router.get("/", listVideos);

module.exports = router;