const crypto = require("crypto");// للعمليات الحسابية وتشفير البيانات

// ===================
// 🔐 التشفير
// ===================
const algorithm = "aes-256-ctr";
const key = Buffer.from(process.env.SECRET_KEY, "hex");

//  دالة لتشفير النص (مثلاً: تشفير التوكن قبل حفظه في MongoDB)
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

//  دالة لفك تشفير النص (مثلاً: استرجاع التوكن لاستخدامه في البوت)

function decrypt(hash) {
  const [ivHex, contentHex] = hash.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const content = Buffer.from(contentHex, "hex");
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
}
// تصدير الدوال للخارج ككائن (Object)
module.exports = { encrypt, decrypt }