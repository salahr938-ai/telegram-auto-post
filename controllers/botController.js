const axios = require("axios");
const User = require("../models/User");
const { decrypt } = require("../utils/crypto");

const tasks = new Map();

async function sendTelegramMessage(user, attempt = 1) {
    try {
        const token = decrypt(user.botToken);
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: user.chatId,
            text: user.message,
        });
        console.log(`✅ Message sent to ${user.chatId}`);
    } catch (err) {
        console.log(`❌ ERROR attempt ${attempt}:`, err.message);
        if (attempt < 5) {
            setTimeout(() => sendTelegramMessage(user, attempt + 1), 10000);
        }
    }
}

function startTask(user) {
    const key = user._id.toString();
    if (tasks.has(key)) {
        clearInterval(tasks.get(key));
    }
    sendTelegramMessage(user);
    const interval = setInterval(() => {
        sendTelegramMessage(user);
    }, user.interval * 1000);
    tasks.set(key, interval);
}

exports.getOrders = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).send("❌ userId missing");
        const userOrders = await User.find({ userId });
        res.json(userOrders);
    } catch (err) {
        console.error("❌ GET ORDERS ERROR:", err);
        res.status(500).send("خطأ في الخادم");
    }
};

exports.saveAndStart = async (req, res) => {
    try {
        const { userId, botToken, chatId, message, interval } = req.body;
        if (!userId || !botToken || !chatId || !message || !interval) return res.status(400).send("❌ بيانات ناقصة");
        const orderCount = await User.countDocuments({ userId });
        if (orderCount >= 5) return res.status(400).send("⚠️ الحد الأقصى 5 طلبات");
        const { encrypt } = require("../utils/crypto");
        const encryptedToken = encrypt(botToken);
        const user = await User.create({ userId, botToken: encryptedToken, chatId, message, interval });
        startTask(user);
        res.json(user);
    } catch (err) {
        console.log("❌ SERVER ERROR:", err);
        res.status(500).send("❌ خطأ بسيرفر الحفظ");
    }
};

exports.startBot = async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).send("❌ لازم id");
    try {
        const user = await User.findById(id);
        if (!user) return res.status(404).send("❌ الطلب غير موجود في قاعدة البيانات");
        startTask(user);
        res.send("▶️ تم تشغيل المهمة بنجاح");
    } catch (err) {
        console.log("❌ Start Error:", err);
        res.status(500).send("❌ خطأ في السيرفر");
    }
};

exports.stopBot = (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).send("❌ لازم id");
    const taskKey = id.toString();
    if (tasks.has(taskKey)) {
        clearInterval(tasks.get(taskKey));
        tasks.delete(taskKey);
        return res.send("🛑 تم الإيقاف بنجاح");
    }
    res.send("⚠️ لا توجد مهمة نشطة حالياً لهذا المعرّف");
};

exports.deleteTokenOnly = async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send("❌ userId missing");
    try {
        const users = await User.find({ userId });
        users.forEach(user => {
            const key = user._id.toString();
            if (tasks.has(key)) {
                clearInterval(tasks.get(key));
                tasks.delete(key);
            }
        });
        await User.deleteMany({ userId });
        res.send("✅ تم مسح التوكن والبيانات بنجاح من الذاكرة وقاعدة البيانات");
    } catch (err) {
        console.error("❌ خطأ في مسار الحذف الكلي:", err);
        res.status(500).send("❌ فشل السيرفر في الحذف");
    }
};

exports.deleteSingleOrder = async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).send("❌ id missing");
    try {
        const taskKey = id.toString();
        if (tasks.has(taskKey)) {
            clearInterval(tasks.get(taskKey));
            tasks.delete(taskKey);
        }
        const result = await User.findByIdAndDelete(id);
        if (result) {
            res.send("✅ تم حذف البطاقة والمهمة بنجاح");
        } else {
            res.status(404).send("⚠️ غير موجود");
        }
    } catch (err) {
        console.error("❌ Delete Single Order Error:", err);
        res.status(500).send("❌ خطأ في السيرفر أثناء الحذف");
    }
};