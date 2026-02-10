import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyD8hrO2kX1zXaA46PImzMGqOt4iTwhXKI0",
    authDomain: "call-now-24582.firebaseapp.com",
    projectId: "call-now-24582",
    storageBucket: "call-now-24582.firebasestorage.app",
    messagingSenderId: "982107544824",
    appId: "1:982107544824:web:c5b6806042ba44ff896f0d",
    measurementId: "G-W27HMG1TKV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);

const provider = new GoogleAuthProvider();

// --- State ---
const appState = {
    balance: 1.00,
    currentUser: null,
    twilioToken: null,
    twilioDevice: null,
    aliasValue: "",
    callHistory: [], 
    transactions: [],
    currentCallTimer: null,
    callSeconds: 0,
    currentCallNumber: "",
    activeCallConnection: null
};

// ==========================================
// 0. Auth Listener
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is logged in:", user.uid);
        window.updateUserState(user);
        window.updateProfileUI(user);
        
        // الانتقال للواجهة الرئيسية إذا كان المستخدم في شاشة الدخول
        const loginScreen = document.getElementById('login-screen');
        const mainApp = document.getElementById('main-app');
        const permissionScreen = document.getElementById('permission-screen');

        if (!loginScreen.classList.contains('hidden') || permissionScreen.style.display === 'none') {
            loginScreen.style.opacity = '0';
            setTimeout(() => {
                loginScreen.classList.add('hidden');
                mainApp.classList.remove('hidden');
                window.initApp();
            }, 300);
        }
    } else {
        console.log("User is logged out");
        window.clearUserState();
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('login-screen').style.opacity = '1';
    }
});

// ==========================================
// 1. Firebase Auth (مستقر)
// ==========================================
window.firebaseAuth = {
    login: () => {
        const terms = document.getElementById('terms-checkbox').checked;
        if (!terms) { window.showToast("يرجى الموافقة على الشروط أولاً"); return; }
        const btn = document.querySelector('#login-screen .login-btn');
        btn.textContent = "جاري الاتصال...";
        btn.disabled = true;

        signInWithPopup(auth, provider)
            .then((result) => {
                // تم إزالة الانتقال اليدوي هنا لأن المستمع (onAuthStateChanged) سيتولى الأمر تلقائياً
            })
            .catch((error) => {
                console.error("Login Error", error);
                window.showToast("فشل تسجيل الدخول: " + error.message);
                btn.textContent = "Sign in with Google";
                btn.disabled = false;
            });
    },
    logout: () => {
        signOut(auth).then(() => {
            window.showToast("تم تسجيل الخروج");
            window.clearUserState();
            if (appState.twilioDevice && appState.activeCallConnection) {
                appState.activeCallConnection.disconnect();
            }
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('login-screen').style.opacity = '1';
        }).catch((error) => { window.showToast("خطأ في تسجيل الخروج"); });
    }
};

// ==========================================
// 2. Twilio Logic (المنطق الجديد للاتصال الحقيقي)
// ==========================================

// الحصول على التوكن من Firebase Functions
async function getTwilioAccessToken() {
    const getTwilioTokenFunc = httpsCallable(functions, 'getTwilioToken');
    try {
        const result = await getTwilioTokenFunc();
        return result.data.token;
    } catch (error) {
        console.error("Error getting token:", error);
        throw new Error("فشل الحصول على توكن الاتصال");
    }
}

// تهيئة Twilio Device (يتم مرة واحدة عند أول اتصال)
async function setupTwilioDevice() {
    if (appState.twilioDevice) return appState.twilioDevice; 

    try {
        const token = await getTwilioAccessToken();
        
        // إعداد Twilio.Device باستخدام التوكن
        appState.twilioDevice = new Twilio.Device(token);

        // مراقبة حالة الجهاز
        appState.twilioDevice.on('ready', function(device) {
            console.log("Twilio Device Ready!");
        });

        appState.twilioDevice.on('error', function(error) {
            console.error("Twilio Error:", error);
            window.showToast("خطأ في الاتصال: " + error.message);
        });

        appState.twilioDevice.on('connect', function(conn) {
            console.log("Call Connected!");
            document.getElementById('call-status-msg').textContent = "مكالمة جارية";
            document.getElementById('call-status-msg').style.color = "white";
            startTimer(); // بدء العداد عند الرد
        });

        appState.twilioDevice.on('disconnect', function(conn) {
            console.log("Call Disconnected");
            endCallLogic();
        });

    } catch (error) {
        window.showToast("فشل إعداد الجهاز الصوتي");
    }
}

// الدالة الرئيسية لبدء الاتصال
window.initiateCall = async function() {
    const rawNumber = document.getElementById('dial-display').textContent;
    if (!rawNumber) { window.showToast("أدخل رقم أولاً"); return; }

    try {
        window.showToast("جاري تهيئة الاتصال...");
        await setupTwilioDevice();

        if (!appState.twilioDevice) {
            window.showToast("الجهاز غير جاهز، يرجى المحاولة مرة أخرى");
            return;
        }

        let displayName = rawNumber;
        const isAnon = document.getElementById('anon-toggle').checked;
        if (isAnon && appState.aliasValue) displayName = appState.aliasValue;

        // UI Updates
        appState.currentCallNumber = rawNumber;
        document.getElementById('active-caller-name').textContent = displayName;
        document.getElementById('call-status-msg').textContent = "جاري الاتصال...";
        document.getElementById('call-status-msg').style.color = "#aaa";
        document.getElementById('call-timer').style.display = 'none';
        document.getElementById('screen-active-call').classList.add('active');

        // الاتصال عبر Twilio Device
        // هذا سيرسل طلباً إلى Twilio (وهو Proxy) للاتصال بالرقم
        const params = { To: rawNumber };
        
        appState.twilioDevice.connect(params).then(connection => {
            appState.activeCallConnection = connection;
        }, error => {
             window.showToast("فشل الاتصال");
             endCallLogic();
        });

    } catch (error) {
        console.error(error);
        window.showToast("حدث خطأ أثناء محاولة الاتصال");
    }
};

function startTimer() {
    document.getElementById('call-timer').style.display = 'block';
    appState.callSeconds = 0;
    appState.currentCallTimer = setInterval(() => {
        appState.callSeconds++;
        const mins = Math.floor(appState.callSeconds / 60).toString().padStart(2, '0');
        const secs = (appState.callSeconds % 60).toString().padStart(2, '0');
        document.getElementById('call-timer').textContent = `${mins}:${secs}`;
    }, 1000);
}

window.endCall = function() {
    if (appState.activeCallConnection) {
        appState.activeCallConnection.disconnect();
    } else {
        endCallLogic();
    }
};

function endCallLogic() {
    clearInterval(appState.currentCallTimer);
    document.getElementById('screen-active-call').classList.remove('active');
    document.getElementById('dial-display').textContent = "";
    
    // حساب التكلفة
    const cost = appState.callSeconds * 0.01;
    if (appState.callSeconds > 0) {
        appState.balance -= cost;
        window.updateBalanceDisplay();
        window.updateReports();
        window.showToast(`انتهت المكالمة. التكلفة: $${cost.toFixed(2)}`);
    }
}

// ==========================================
// 3. دوال واجهة المستخدم (UI Helpers)
// ==========================================
window.updateUserState = (user) => { appState.currentUser = user; };
window.clearUserState = () => { appState.currentUser = null; };
window.updateProfileUI = (user) => {
    const img = document.getElementById('profile-img'); const icon = document.getElementById('profile-avatar-icon');
    const nameEl = document.getElementById('profile-name'); const emailEl = document.getElementById('profile-email'); const uidEl = document.getElementById('profile-uid');
    if (user) {
        nameEl.textContent = user.displayName || "مستخدم"; emailEl.textContent = user.email || "لا يوجد بريد";
        uidEl.textContent = user.uid; // عرض الـ Identity ID
        if (user.photoURL) { img.src = user.photoURL; img.style.display = 'block'; icon.style.display = 'none'; }
        else { img.style.display = 'none'; icon.style.display = 'flex'; }
    } else {
        nameEl.textContent = "مستخدم جديد"; emailEl.textContent = "user@example.com"; uidEl.textContent = "...";
        img.style.display = 'none'; icon.style.display = 'flex';
    }
};
window.showToast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); };
window.initApp = () => { window.updateBalanceDisplay(); window.renderDummyLists(); window.initPayPal(); };

window.switchMainTab = (screenId, navEl) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navEl.classList.add('active');
};
window.navigateTo = (pageId) => { document.querySelectorAll('.page').forEach(p => p.classList.remove('active')); document.getElementById(pageId).classList.add('active'); };
window.goBack = () => window.navigateTo('screen-more');
window.grantAllPermissions = () => {
    const btn = document.querySelector('#permission-screen button');
    btn.textContent = "جاري التحقق..."; btn.disabled = true;
    setTimeout(() => {
        ['mic', 'contacts', 'log'].forEach(id => { const el = document.getElementById('perm-' + id); el.classList.add('perm-granted'); el.querySelector('i').className = 'fas fa-check-circle'; });
        setTimeout(() => { document.getElementById('permission-screen').style.display = 'none'; document.getElementById('login-screen').classList.remove('hidden'); }, 800);
    }, 1000);
};

// لوحة المفاتيح
window.dial = (key) => { const display = document.getElementById('dial-display'); if (display.textContent.length < 15) display.textContent += key; };
window.deleteDigit = () => { document.getElementById('dial-display').textContent = document.getElementById('dial-display').textContent.slice(0, -1); };
window.toggleAliasInput = () => {
    const isChecked = document.getElementById('anon-toggle').checked;
    const wrapper = document.getElementById('alias-input-wrapper'); const input = document.getElementById('alias-input-field');
    if (isChecked) { wrapper.style.display = 'block'; input.focus(); } else { wrapper.style.display = 'none'; appState.aliasValue = ""; input.value = ""; }
};
window.updateAliasValue = () => { appState.aliasValue = document.getElementById('alias-input-field').value; };

// التحكم في المكالمة
window.toggleMute = (btn) => {
    if(appState.activeCallConnection) {
        appState.activeCallConnection.mute(!appState.activeCallConnection.isMuted);
        btn.classList.toggle('active');
    }
};
window.toggleKeypad = () => window.showToast("لوحة الأرقام مغلقة");
window.toggleSpeaker = (btn) => window.toggleMute(btn);

// التقارير والماليات
window.updateBalanceDisplay = () => {
    const formatted = "$" + appState.balance.toFixed(2);
    document.getElementById('main-balance-btn').textContent = formatted + " >";
    document.getElementById('profile-balance').textContent = formatted;
};
window.renderDummyLists = () => {
    const contacts = ["أحمد محمد", "سارة علي", "العمل", "خالد", "أمي"];
    document.getElementById('contacts-list').innerHTML = contacts.map(c => `<div class="list-item"><div class="avatar"><i class="fas fa-user"></i></div><div class="list-info"><div class="list-name">${c}</div><div class="list-sub">موبايل</div></div></div>`).join('');
    const msgs = ["أهلاً بك", "رصيدك منخفض", "موعد الغد"];
    document.getElementById('messages-list').innerHTML = msgs.map(m => `<div class="list-item"><div class="avatar"><i class="fas fa-user"></i></div><div class="list-info"><div class="list-name">مجهول</div><div class="list-sub">${m}</div></div></div>`).join('');
};
window.processTransfer = () => {
    const to = document.getElementById('transfer-to').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    if (!to || amount <= 0) { window.showToast("بيانات غير صحيحة"); return; }
    if (amount > appState.balance) { window.showToast("رصيد غير كافٍ"); return; }
    appState.balance -= amount;
    appState.transactions.unshift({ type: `تحويل لـ ${to}`, amount: -amount, date: new Date().toLocaleTimeString() });
    document.getElementById('transfer-to').value = ""; document.getElementById('transfer-amount').value = "";
    window.updateBalanceDisplay(); window.updateReports(); window.showToast("تم التحويل بنجاح"); window.goBack();
};
window.updateReports = () => {
    document.getElementById('reports-financial-list').innerHTML = appState.transactions.map(t => `<tr><td>${t.type}</td><td style="font-size:0.8rem; color:#777;">${t.date}</td><td style="color: ${t.amount < 0 ? 'red' : 'green'}; font-weight:bold;">$${Math.abs(t.amount).toFixed(2)}</td></tr>`).join('');
    document.getElementById('reports-calls-list').innerHTML = appState.callHistory.map(c => `<tr><td>${c.name}</td><td>${c.duration}</td><td style="color:red;">$${c.cost}</td></tr>`).join('');
};
window.openWhatsApp = () => window.open('https://wa.me/967736962744', '_blank');

// الرسائل
window.openCompose = () => document.getElementById('screen-compose').classList.remove('hidden');
window.closeCompose = () => document.getElementById('screen-compose').classList.add('hidden');
window.sendMessage = () => { window.showToast("تم إرسال الرسالة"); window.closeCompose(); };

// PayPal
window.initPayPal = () => {
    if (window.paypal) {
        paypal.Buttons({
            style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal' },
            createOrder: function(data, actions) {
                const amountInput = document.getElementById('paypal-amount').value;
                if (!amountInput || parseFloat(amountInput) <= 0) { window.showToast("يرجى إدخال مبلغ صحيح"); return Promise.reject("Invalid Amount"); }
                return actions.order.create({ purchase_units: [{ amount: { value: amountInput } }] });
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(function(details) {
                    const amountPaid = document.getElementById('paypal-amount').value;
                    const finalAmount = parseFloat(amountPaid);
                    const uid = appState.currentUser ? appState.currentUser.uid : "guest";
                    console.log(`Processing PayPal payment for UID: ${uid}`);
                    appState.balance += finalAmount;
                    appState.transactions.unshift({ type: 'شحن PayPal', amount: finalAmount, date: new Date().toLocaleTimeString() });
                    window.updateBalanceDisplay(); window.updateReports();
                    window.showToast(`تم الشحن بنجاح! الرصيد: $${appState.balance.toFixed(2)}`);
                    document.getElementById('paypal-amount').value = "";
                    setTimeout(() => { window.goBack(); }, 1500);
                });
            },
            onCancel: function (data) { window.showToast("تم إلغاء عملية الدفع"); },
            onError: function (err) { console.error(err); window.showToast("حدث خطأ في الدفع، حاول مرة أخرى"); }
        }).render('#paypal-button-container');
    } else { console.error("PayPal SDK failed to load."); }
};