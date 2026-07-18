// 1. الاستيرادات (Dependencies & Imports)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const firestore = require("./firebase");
const cron = require('node-cron');
const WheelUser = require('./models/WheelUser');
const path = require('path');
// استيراد الـ Routes
const referralRoutes = require("./routes/referralRoutes");
const wheelRoutes = require("./routes/wheelRoutes");
const botRoutes = require("./routes/botRoutes");
const withdrawRoutes = require("./routes/withdrawRoutes");
const systemRoutes = require("./routes/systemRoutes");
const userRoutes = require("./routes/userRoutes");
const quizRoutes = require("./routes/quizRoutes");
const dailyRoutes = require("./routes/dailyRoutes");
const { setDbStatus, getDbStatus } = require("./config/dbStatus");
const pointsRoutes = require("./routes/pointsRoutes");
const scratchRoutes = require('./routes/scratchRoutes');
const surpriseBoxRoutes = require("./routes/surpriseBoxRoutes");
// ==========================================
// 2. إعدادات التطبيق (App Setup)
// ==========================================
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
    // إذا لم تكن القاعدة جاهزة، اسمح فقط بفتح الموقع، أما طلبات الـ API فامنحها خطأ 503
    if (!getDbStatus() && req.path !== '/' && req.path !== '/index.html' && req.path !== '/privacy.html') {
        return res.status(503).json({ error: "⏳ DB not ready" });
    }
    next();
});

mongoose.set('autoIndex', false); // إيقاف auto index

app.use(cors());
app.use(express.json());


// 3. تعريف المسارات (Routes)

// المسارات المنظمة عبر الـ Router
app.use("/api/referral", referralRoutes);
app.use("/api/wheel", wheelRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/", systemRoutes);
app.use("/api/user", userRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/daily", dailyRoutes);
app.use("/api/points", pointsRoutes);
app.use('/api/scratch', scratchRoutes);
app.use("/api/surprise-box", surpriseBoxRoutes);
// ==========================================
// 4. الاتصال بقاعدة البيانات والتشغيل
// ==========================================
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log("✅ Connected to MongoDB");
       setDbStatus(true);

       // --- كود التصفير اليومي (Cron Job) ---
        cron.schedule('0 0 * * *', async () => {
            try {
                await WheelUser.updateMany({}, { adsLeft: 5 });
                console.log("🔄 Reset all adsLeft to 5 for all users");
            } catch (error) {
                console.error("❌ Cron Job Error:", error);
            }
        });

        // تنظيف الـ Index
        try {
            const User = require("./models/User");
            const indexes = await User.collection.indexes();
            if (indexes.find(i => i.name === "userId_1")) {
                await User.collection.dropIndex("userId_1");
                console.log("🗑️ Removed old unique index");
            }
        } catch (e) {
            console.log("⚠️ Index operation skipped:", e.message);
        }

        // تشغيل المهام (Task Manager logic)
        const { startTask } = require("./utils/taskManager");
        const User = require("./models/User");
        const users = await User.find({});
        console.log(`🔄 Restoring ${users.length} tasks...`);
        users.forEach(user => startTask(user));
    })
    .catch(err => console.error("❌ MongoDB Error:", err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});