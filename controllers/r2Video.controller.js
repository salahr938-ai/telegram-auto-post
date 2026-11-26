const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { R2Video, ALLOWED_R2_CATEGORIES } = require("../models/r2Video.model");

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// 1) طلب رابط رفع مباشر إلى Cloudflare R2
async function requestUploadUrl(req, res) {
  try {
    const { ownerId, title, durationSec, category, mimeType = "video/mp4" } = req.body;

    if (!ownerId || !title) {
      return res.status(400).json({ error: "ownerId و title مطلوبان" });
    }

    if (!ALLOWED_R2_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: "التصنيف غير مسموح به",
        allowedCategories: ALLOWED_R2_CATEGORIES,
      });
    }

    const duration = Number(durationSec);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) {
      return res.status(400).json({
        error: "مدة الفيديو يجب ألا تتجاوز 3 دقائق (180 ثانية)",
      });
    }

    const ext = mimeType.includes("webm") ? "webm" : "mp4";
    const videoKey = `r2-videos/${ownerId}/${Date.now()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: videoKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
    const cleanDomain = (process.env.R2_PUBLIC_DOMAIN || "").replace(/\/+$/, "");
    const videoUrl = `${cleanDomain}/${videoKey}`;

    return res.json({
      uploadUrl,
      videoUrl,
      videoKey,
      expiresInSec: 300,
    });
  } catch (err) {
    console.error("requestUploadUrl error:", err);
    return res.status(500).json({ error: "تعذر إنشاء رابط الرفع" });
  }
}

// 2) حفظ بيانات الفيديو في MongoDB بعد رفعه إلى R2
async function createVideoRecord(req, res) {
  try {
    const { ownerId, channelName, title, videoKey, videoUrl, durationSec, category } = req.body;

    if (!ownerId || !title || !videoKey || !videoUrl || !category) {
      return res.status(400).json({ error: "بيانات الفيديو غير مكتملة" });
    }

    if (!ALLOWED_R2_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "التصنيف غير مسموح به" });
    }

    const duration = Number(durationSec);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) {
      return res.status(400).json({ error: "مدة الفيديو تتجاوز الحد المسموح (180 ثانية)" });
    }

    const created = await R2Video.create({
      ownerId,
      channelName: channelName || "قناتي",
      title,
      videoKey,
      videoUrl,
      durationSec: duration,
      category,
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error("createVideoRecord error:", err);
    return res.status(500).json({ error: "تعذر حفظ الفيديو في قاعدة البيانات" });
  }
}

// 3) جلب الفيديوهات للعرض في التطبيق
async function listVideos(req, res) {
  try {
    const filter = { isActive: true };
    if (req.query.category && req.query.category !== "الكل") {
      filter.category = req.query.category;
    }

    const videos = await R2Video.find(filter).sort({ createdAt: -1 }).limit(50);
    return res.json(videos);
  } catch (err) {
    console.error("listVideos error:", err);
    return res.status(500).json({ error: "تعذر جلب الفيديوهات" });
  }
}

module.exports = {
  requestUploadUrl,
  createVideoRecord,
  listVideos,
};