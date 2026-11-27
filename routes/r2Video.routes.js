const express = require("express");
const router = express.Router();
const {
  requestUploadUrl,
  requestThumbnailUploadUrl,
  createVideoRecord,
  listVideos,
} = require("../controllers/r2Video.controller");

router.post("/upload-url", requestUploadUrl);
router.post("/thumbnail-url", requestThumbnailUploadUrl);
router.post("/", createVideoRecord);
router.get("/", listVideos);

module.exports = router;