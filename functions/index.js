const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilio = require('twilio');
const { ClientCapability } = twilio.jwt;

// تهيئة Firebase Admin
admin.initializeApp();

// --- إعدادات Twilio ---
// للإنتاج، استخدم Environment Variables في Replit (Secrets).
// مؤقتاً للتجربة، ضع القيم هنا:
const accountSid = process.env.TWILIO_ACCOUNT_SID || 'YOUR_ACCOUNT_SID_HERE';
const authToken = process.env.TWILIO_AUTH_TOKEN || 'YOUR_AUTH_TOKEN_HERE';
const appSid = process.env.TWILIO_APP_SID || 'YOUR_TWIML_APP_SID_HERE'; // معرف تطبيق TwiML من لوحة Twilio

const client = new twilio(accountSid, authToken);

// دالة لتوليد توكن Twilio للواجهة الأمامية
exports.getTwilioToken = functions.https.onCall(async (data, context) => {
    // 1. التحقق من أن المستخدم مسجل الدخول (Identity Generation)
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'يجب تسجيل الدخول أولاً.');
    }

    // نستخدم Firebase UID كـ Twilio Identity لضمان التميز بين المستخدمين
    const uid = context.auth.uid; 
    
    // 2. إنشاء Capability Token
    const capability = new ClientCapability({
        accountSid: accountSid,
        authToken: authToken,
    });

    // إضافة صلاحيات (Scope)
    capability.addScope(new twilio.jwt.ClientCapabilityScope({ 
        applicationSid: appSid 
    }));

    return {
        token: capability.toJwt(),
        identity: uid
    };
});

// دالة إجرائية: تسجيل بداية المكالمة في قاعدة البيانات (اختياري)
exports.logCallStart = functions.https.onCall(async (data, context) => {
    const { toNumber } = data;
    const uid = context.auth.uid;
    console.log(`Private Dialer: User ${uid} calling ${toNumber}`);
    return { status: 'logged' };
});