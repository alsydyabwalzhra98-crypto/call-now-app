import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const db = getFirestore(app);

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
// 0. Auth Listener (تم التصحيح والتحسين)
// ==========================================
let unsubscribeFirestore = null;

// دالة مساعدة للتبديل بين الشاشات بسلاسة
function switchScreen(screenToShow) {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const permissionScreen = document.getElementById('permission-screen');

    // إخفاء الكل أولاً
    loginScreen.classList.add('hidden');
    mainApp.classList.add('hidden');
    // permissionScreen يتم التحكم فيه بشكل منفصل حسب منطق التطبيق الخاص بك

    // إظهار الشاشة المطلوبة
    if (screenToShow === 'main') {
        mainApp.classList.remove('hidden');
        loginScreen.style.opacity = '0'; // تأكيد الإخفاء
    } else if (screenToShow === 'login') {
        loginScreen.classList.remove('hidden');
        loginScreen.style.opacity = '1';
    }
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("User is logged in:", user.uid);
        
        // 1. تحديث الحالة المحلية فوراً
        window.updateUserState(user);
        window.updateProfileUI(user);

        // 2. الانتقال للواجهة الرئيسية فوراً (لا تنتظر قاعدة البيانات)
        // التحقق مما إذا كان المستخدم قد منح الأذونات مسبقاً (يمكنك تحسين هذا الشرط لاحقاً)
        const permissionScreen = document.getElementById('permission-screen');
        if (permissionScreen && permissionScreen.style.display !== 'none') {
            // إذا كانت شاشة الأذونات ظاهرة، لا نفعل شيئاً وننتظر المستخدم
        } else {
            switchScreen('main');
            window.initApp();
        }

        // 3. التعامل مع قاعدة البيانات في الخلفية (Async)
        const userRef = doc(db, "users", user.uid);
        try {
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                // إنشاء مستند جديد
                await setDoc(userRef, {
                    displayName: user.displayName,
                    email: user.email,
                    balance: 1.00,
                    createdAt: new Date().toISOString()
                });
            } else {
                // تحديث الرصيد المحلي من القاعدة مباشرة
                const data = userSnap.data();
                appState.balance = data.balance || 0;
                window.updateBalanceDisplay();
            }

            // الاستماع للتغييرات
            if (unsubscribeFirestore) unsubscribeFirestore();
            unsubscribeFirestore = onSnapshot(userRef, (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    appState.balance = data.balance !== undefined ? data.balance : appState.balance;
                    window.updateBalanceDisplay();
                }
            });

        } catch (error) {
            console.error("Firestore Error:", error);
            // حتى لو حدث خطأ في قاعدة البيانات، المستخدم لا يزال مسجلاً للدخول
            // window.showToast("تنبيه: لم يتم مزامنة الرصيد");
        }

    } else {
        console.log("User is logged out");
        if (unsubscribeFirestore) unsubscribeFirestore();
        window.clearUserState();
        
        // العودة لشاشة التسجيل
        switchScreen('login');
        
        // إعادة تعيين زر الدخول
        const btn = document.querySelector('#login-screen .login-btn');
        if(btn) {
            btn.textContent = "Sign in with Google";
            btn.disabled = false;
        }
    }
});

// ==========================================
// 1. Firebase Auth
// ==========================================
window.firebaseAuth = {
    login: () => {
        const termsCheckbox = document.getElementById('terms-checkbox');
        // التحقق من وجود العنصر لتجنب الأخطاء
        if (termsCheckbox && !termsCheckbox.checked) { 
            window.showToast("يرجى الموافقة على الشروط أولاً"); 
            return; 
        }
        
        const btn = document.querySelector('#login-screen .login-btn');
        if(btn) {
            btn.textContent = "جاري الاتصال...";
            btn.disabled = true;
        }

        signInWithPopup(auth, provider)
            .then((result) => {
                // النجاح يتم التعامل معه تلقائياً عبر onAuthStateChanged
                console.log("Login Success");
            })
            .catch((error) => {
                console.error("Login Error", error);
                window.showToast("فشل تسجيل الدخول: " + error.message);
                if(btn) {
                    btn.textContent = "Sign in with Google";
                    btn.disabled = false;
                }
            });
    },
    logout: () => {
        signOut(auth).then(() => {
            window.showToast("تم تسجيل الخروج");
            window.clearUserState();
            if (appState.twilioDevice && appState.activeCallConnection) {
                appState.activeCallConnection.disconnect();
            }
            // الانتقال يتم عبر onAuthStateChanged
        }).catch((error) => { window.showToast("خطأ في تسجيل الخروج"); });
    }
};

// ==========================================
// 2. Twilio Logic (كما هو)
// ==========================================

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

async function setupTwilioDevice() {
    if (appState.twilioDevice) return appState.twilioDevice; 

    try {
        const token = await getTwilioAccessToken();
        appState.twilioDevice = new Twilio.Device(token);

        appState.twilioDevice.on('ready', function(device) {
            console.log("Twilio Device Ready!");
        });

        appState.twilioDevice.on('error', function(error) {
            console.error("Twilio Error:", error);
            window.showToast("خطأ في الاتصال: " + error.message);
        });

        appState.twilioDevice.on('connect', function(conn) {
            console.log("Call Connected!");
            const statusMsg = document.getElementById('call-status-msg');
            if(statusMsg) {
                statusMsg.textContent = "مكالمة جارية";
                statusMsg.style.color = "white";
            }
            startTimer(); 
        });

        appState.twilioDevice.on('disconnect', function(conn) {
            console.log("Call Disconnected");
            endCallLogic();
        });

    } catch (error) {
        window.showToast("فشل إعداد الجهاز الصوتي");
    }
}

window.initiateCall = async function() {
    const rawNumberEl = document.getElementById('dial-display');
    const rawNumber = rawNumberEl ? rawNumberEl.textContent : "";
    
    if (!rawNumber) { window.showToast("أدخل رقم أولاً"); return; }

    try {
        window.showToast("جاري تهيئة الاتصال...");
        await setupTwilioDevice();

        if (!appState.twilioDevice) {
            window.showToast("الجهاز غير جاهز، يرجى المحاولة مرة أخرى");
            return;
        }

        let displayName = rawNumber;
        const anonToggle = document.getElementById('anon-toggle');
        const isAnon = anonToggle ? anonToggle.checked : false;
        
        if (isAnon && appState.aliasValue) displayName = appState.aliasValue;

        // UI Updates
        appState.currentCallNumber = rawNumber;
        
        const callerNameEl = document.getElementById('active-caller-name');
        if(callerNameEl) callerNameEl.textContent = displayName;
        
        const statusMsg = document.getElementById('call-status-msg');
        if(statusMsg) {
            statusMsg.textContent = "جاري الاتصال...";
            statusMsg.style.color = "#aaa";
        }
        
        const timerEl = document.getElementById('call-timer');
        if(timerEl) timerEl.style.display = 'none';
        
        document.getElementById('screen-active-call').classList.add('active');

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
    const timerEl = document.getElementById('call-timer');
    if(timerEl) timerEl.style.display = 'block';
    
    appState.callSeconds = 0;
    appState.currentCallTimer = setInterval(() => {
        appState.callSeconds++;
        const mins = Math.floor(appState.callSeconds / 60).toString().padStart(2, '0');
        const secs = (appState.callSeconds % 60).toString().padStart(2, '0');
        if(timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

window.endCall = function() {
    if (appState.activeCallConnection) {
        appState.activeCallConnection.disconnect();
    } else {
        endCallLogic();
    }
};

async function endCallLogic() {
    clearInterval(appState.currentCallTimer);
    document.getElementById('screen-active-call').classList.remove('active');
    
    const display = document.getElementById('dial-display');
    if(display) display.textContent = "";
    
    // حساب التكلفة
    const cost = appState.callSeconds * 0.01;
    if (appState.callSeconds > 0 && appState.currentUser) {
        const newBalance = appState.balance - cost;
        
        try {
            const userRef = doc(db, "users", appState.currentUser.uid);
            await updateDoc(userRef, { balance: newBalance });
            window.showToast(`انتهت المكالمة. التكلفة: $${cost.toFixed(2)}`);
            window.updateReports();
        } catch (error) {
            console.error("Failed to update balance:", error);
            // تحديث محلي مؤقت
            appState.balance = newBalance;
            window.updateBalanceDisplay();
        }
    }
}

// ==========================================
// 3. UI Helpers
// ==========================================
window.updateUserState = (user) => { appState.currentUser = user; };
window.clearUserState = () => { appState.currentUser = null; };

window.updateProfileUI = (user) => {
    const img = document.getElementById('profile-img'); 
    const icon = document.getElementById('profile-avatar-icon');
    const nameEl = document.getElementById('profile-name'); 
    const emailEl = document.getElementById('profile-email'); 
    const uidEl = document.getElementById('profile-uid');
    
    if (user) {
        if(nameEl) nameEl.textContent = user.displayName || "مستخدم"; 
        if(emailEl) emailEl.textContent = user.email || "لا يوجد بريد";
        if(uidEl) uidEl.textContent = user.uid; 
        
        if (user.photoURL && img) { 
            img.src = user.photoURL; 
            img.style.display = 'block'; 
            if(icon) icon.style.display = 'none'; 
        } else { 
            if(img) img.style.display = 'none'; 
            if(icon) icon.style.display = 'flex'; 
        }
    } else {
        if(nameEl) nameEl.textContent = "مستخدم جديد";
        if(img) img.style.display = 'none';
        if(icon) icon.style.display = 'flex';
    }
};

window.showToast = (msg) => { 
    const t = document.getElementById('toast'); 
    if(!t) return;
    t.textContent = msg; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 3000); 
};

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
    if(btn) {
        btn.textContent = "جاري التحقق..."; 
        btn.disabled = true;
    }
    setTimeout(() => {
        ['mic', 'contacts', 'log'].forEach(id => { 
            const el = document.getElementById('perm-' + id); 
            if(el) {
                el.classList.add('perm-granted'); 
                el.querySelector('i').className = 'fas fa-check-circle'; 
            }
        });
        setTimeout(() => { 
            document.getElementById('permission-screen').style.display = 'none'; 
            // بعد منح الأذونات، تحقق من حالة تسجيل الدخول لعرض الشاشة الصحيحة
            if (auth.currentUser) {
                switchScreen('main');
            } else {
                switchScreen('login');
            }
        }, 800);
    }, 1000);
};

// لوحة المفاتيح والمدخلات
window.dial = (key) => { const display = document.getElementById('dial-display'); if (display && display.textContent.length < 15) display.textContent += key; };
window.deleteDigit = () => { const display = document.getElementById('dial-display'); if(display) display.textContent = display.textContent.slice(0, -1); };

window.toggleAliasInput = () => {
    const toggle = document.getElementById('anon-toggle');
    const wrapper = document.getElementById('alias-input-wrapper'); 
    const input = document.getElementById('alias-input-field');
    
    if (toggle && toggle.checked) { 
        wrapper.style.display = 'block'; 
        input.focus(); 
    } else { 
        wrapper.style.display = 'none'; 
        appState.aliasValue = ""; 
        input.value = ""; 
    }
};

window.updateAliasValue = () => { appState.aliasValue = document.getElementById('alias-input-field').value; };
window.toggleMute = (btn) => {
    if(appState.activeCallConnection) {
        appState.activeCallConnection.mute(!appState.activeCallConnection.isMuted);
        btn.classList.toggle('active');
    }
};
window.toggleKeypad = () => window.showToast("لوحة الأرقام مغلقة");
window.toggleSpeaker = (btn) => window.toggleMute(btn);

window.updateBalanceDisplay = () => {
    const formatted = "$" + appState.balance.toFixed(2);
    const btn = document.getElementById('main-balance-btn');
    const profileBal = document.getElementById('profile-balance');
    if(btn) btn.textContent = formatted + " >";
    if(profileBal) profileBal.textContent = formatted;
};

window.renderDummyLists = () => {
    const contacts = ["أحمد محمد", "سارة علي", "العمل", "خالد", "أمي"];
    const cList = document.getElementById('contacts-list');
    if(cList) cList.innerHTML = contacts.map(c => `<div class="list-item"><div class="avatar"><i class="fas fa-user"></i></div><div class="list-info"><div class="list-name">${c}</div><div class="list-sub">موبايل</div></div></div>`).join('');
    
    const msgs = ["أهلاً بك", "رصيدك منخفض", "موعد الغد"];
    const mList = document.getElementById('messages-list');
    if(mList) mList.innerHTML = msgs.map(m => `<div class="list-item"><div class="avatar"><i class="fas fa-user"></i></div><div class="list-info"><div class="list-name">مجهول</div><div class="list-sub">${m}</div></div></div>`).join('');
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
    const finList = document.getElementById('reports-financial-list');
    if(finList) finList.innerHTML = appState.transactions.map(t => `<tr><td>${t.type}</td><td style="font-size:0.8rem; color:#777;">${t.date}</td><td style="color: ${t.amount < 0 ? 'red' : 'green'}; font-weight:bold;">$${Math.abs(t.amount).toFixed(2)}</td></tr>`).join('');
    
    const callList = document.getElementById('reports-calls-list');
    if(callList) callList.innerHTML = appState.callHistory.map(c => `<tr><td>${c.name}</td><td>${c.duration}</td><td style="color:red;">$${c.cost}</td></tr>`).join('');
};

window.openWhatsApp = () => window.open('https://wa.me/967736962744', '_blank');
window.openCompose = () => document.getElementById('screen-compose').classList.remove('hidden');
window.closeCompose = () => document.getElementById('screen-compose').classList.add('hidden');
window.sendMessage = () => { window.showToast("تم إرسال الرسالة"); window.closeCompose(); };

window.initPayPal = () => {
    if (window.paypal) {
        // تنظيف الكونتينر القديم إذا وجد لتجنب التكرار
        const container = document.getElementById('paypal-button-container');
        if(container) container.innerHTML = "";

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
                    
                    appState.balance += finalAmount;
                    appState.transactions.unshift({ type: 'شحن PayPal', amount: finalAmount, date: new Date().toLocaleTimeString() });
                    
// تحديث القاعدة
                    if(appState.currentUser) {
                         const userRef = doc(db, "users", appState.currentUser.uid);
                         updateDoc(userRef, { balance: appState.balance });
                    }

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
