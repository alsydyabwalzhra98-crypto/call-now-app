// --- استيراد Firebase SDK ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyD8hrO2kX1zXaA46PImzMGqOt4iTwhXKI0",
    authDomain: "call-now-24582.firebaseapp.com",
    projectId: "call-now-24582",
    storageBucket: "call-now-24582.firebasestorage.app",
    messagingSenderId: "982107544824",
    appId: "1:982107544824:web:c5b6806042ba44ff896f0d",
    measurementId: "G-W27HMG1TKV"
};

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- حالة التطبيق (State) ---
const appState = {
    balance: 1.00,
    currentUser: null,
    aliasValue: "",
    callHistory: [], 
    transactions: [],
    currentCallTimer: null,
    callSeconds: 0,
    currentCallNumber: ""
};

// ==========================================
// 1. منطق Firebase Authentication
// ==========================================
const firebaseAuth = {
    login: () => {
        const terms = document.getElementById('terms-checkbox').checked;
        if (!terms) {
            showToast("يرجى الموافقة على الشروط أولاً");
            return;
        }
        
        const btn = document.querySelector('#login-screen .login-btn');
        btn.textContent = "جاري الاتصال بـ Google...";
        btn.disabled = true;

        signInWithPopup(auth, provider)
            .then((result) => {
                // Signed in successfully
                const user = result.user;
                updateUserState(user);
                updateProfileUI(user);
                
                document.getElementById('login-screen').style.opacity = '0';
                setTimeout(() => {
                    document.getElementById('login-screen').classList.add('hidden');
                    document.getElementById('main-app').classList.remove('hidden');
                    initApp(); 
                }, 300);
            })
            .catch((error) => {
                console.error("Login Error", error);
                showToast("فشل تسجيل الدخول: " + error.message);
                btn.textContent = "Sign in with Google";
                btn.disabled = false;
            });
    },
    logout: () => {
        signOut(auth).then(() => {
            showToast("تم تسجيل الخروج");
            clearUserState();
            
            document.getElementById('main-app').classList.add('hidden');
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('login-screen').style.opacity = '1';
            document.getElementById('terms-checkbox').checked = false;
            
            const btn = document.querySelector('#login-screen .login-btn');
            btn.innerHTML = '<i class="fab fa-google"></i> Sign in with Google';
            btn.disabled = false;
        }).catch((error) => {
            showToast("حدث خطأ أثناء تسجيل الخروج");
        });
    }
};

// ==========================================
// 2. دوال عامة ومساعدة (Exports)
// ==========================================
function updateUserState(user) {
    appState.currentUser = user;
    console.log("User Logged In:", user);
}

function clearUserState() {
    appState.currentUser = null;
}

function updateProfileUI(user) {
    const img = document.getElementById('profile-img');
    const icon = document.getElementById('profile-avatar-icon');
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const uidEl = document.getElementById('profile-uid');

    if (user) {
        nameEl.textContent = user.displayName || "مستخدم";
        emailEl.textContent = user.email || "لا يوجد بريد";
        uidEl.textContent = user.uid;

        if (user.photoURL) {
            img.src = user.photoURL;
            img.style.display = 'block';
            icon.style.display = 'none';
        } else {
            img.style.display = 'none';
            icon.style.display = 'flex';
        }
    } else {
        nameEl.textContent = "مستخدم جديد";
        emailEl.textContent = "user@example.com";
        uidEl.textContent = "...";
        img.style.display = 'none';
        icon.style.display = 'flex';
    }
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; 
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function initApp() {
    updateBalanceDisplay();
    renderDummyLists();
    initPayPal();
}

// ==========================================
// 3. دوال الواجهة والتنقل
// ==========================================
function grantAllPermissions() {
    const btn = document.querySelector('#permission-screen button');
    btn.textContent = "جاري التحقق...";
    btn.disabled = true;
    setTimeout(() => {
        ['mic', 'contacts', 'log'].forEach(id => {
            const el = document.getElementById('perm-' + id);
            el.classList.add('perm-granted');
            el.querySelector('i').className = 'fas fa-check-circle';
        });
        setTimeout(() => {
            document.getElementById('permission-screen').style.display = 'none';
            document.getElementById('login-screen').classList.remove('hidden');
        }, 800);
    }, 1000);
}

function switchMainTab(screenId, navEl) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navEl.classList.add('active');
}

function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

function goBack() { navigateTo('screen-more'); }

function switchTabContent(parent, type) {
    // محاكاة التبديل
}

function updateBalanceDisplay() {
    const formatted = "$" + appState.balance.toFixed(2);
    document.getElementById('main-balance-btn').textContent = formatted + " >";
    document.getElementById('profile-balance').textContent = formatted;
}

function renderDummyLists() {
    const contacts = ["أحمد محمد", "سارة علي", "العمل", "خالد", "أمي"];
    document.getElementById('contacts-list').innerHTML = contacts.map(c => `<div class="list-item"><div class="avatar"><i class="fas fa-user"></i></div><div class="list-info"><div class="list-name">${c}</div><div class="list-sub">موبايل</div></div></div>`).join('');
    const msgs = ["أهلاً بك", "رصيدك منخفض", "موعد الغد"];
    document.getElementById('messages-list').innerHTML = msgs.map(m => `<div class="list-item"><div class="avatar"><i class="fas fa-user"></i></div><div class="list-info"><div class="list-name">مجهول</div><div class="list-sub">${m}</div></div></div>`).join('');
}

// ==========================================
// 4. لوحة المفاتيح والاتصال
// ==========================================
function dial(key) { 
    const display = document.getElementById('dial-display'); 
    if (display.textContent.length < 15) display.textContent += key; 
}

function deleteDigit() { 
    document.getElementById('dial-display').textContent = document.getElementById('dial-display').textContent.slice(0, -1); 
}

function toggleAliasInput() {
    const isChecked = document.getElementById('anon-toggle').checked;
    const wrapper = document.getElementById('alias-input-wrapper');
    const input = document.getElementById('alias-input-field');
    if (isChecked) { wrapper.style.display = 'block'; input.focus(); } 
    else { wrapper.style.display = 'none'; appState.aliasValue = ""; input.value = ""; }
}

function updateAliasValue() { appState.aliasValue = document.getElementById('alias-input-field').value; }

function initiateCall() {
    const rawNumber = document.getElementById('dial-display').textContent;
    if (!rawNumber) { showToast("أدخل رقم أولاً"); return; }
    let displayName = rawNumber;
    const isAnon = document.getElementById('anon-toggle').checked;
    if (isAnon && appState.aliasValue) displayName = appState.aliasValue;

    appState.currentCallNumber = rawNumber;
    document.getElementById('active-caller-name').textContent = displayName;
    document.getElementById('call-timer').textContent = "جاري الاتصال...";
    document.getElementById('screen-active-call').classList.add('active');
    setTimeout(() => { document.getElementById('call-timer').textContent = "00:00"; startTimer(); }, 1500);
}

function startTimer() {
    appState.callSeconds = 0;
    appState.currentCallTimer = setInterval(() => {
        appState.callSeconds++;
        const mins = Math.floor(appState.callSeconds / 60).toString().padStart(2, '0');
        const secs = (appState.callSeconds % 60).toString().padStart(2, '0');
        document.getElementById('call-timer').textContent = `${mins}:${secs}`;
    }, 1000);
}

function endCall() {
    clearInterval(appState.currentCallTimer);
    document.getElementById('screen-active-call').classList.remove('active');
    const cost = appState.callSeconds * 0.01;
    if (appState.callSeconds > 0) {
        appState.balance -= cost;
        const callRecord = {
            name: document.getElementById('active-caller-name').textContent,
            number: appState.currentCallNumber,
            duration: document.getElementById('call-timer').textContent,
            cost: cost.toFixed(2),
            date: new Date().toLocaleTimeString()
        };
        appState.callHistory.unshift(callRecord);
        appState.transactions.unshift({ type: 'مكالمة', amount: -cost, date: callRecord.date });
        updateBalanceDisplay();
        updateReports();
        showToast(`انتهت المكالمة. التكلفة: $${cost.toFixed(2)}`);
    }
    document.getElementById('dial-display').textContent = "";
}

function toggleMute(btn) {
    btn.classList.toggle('active');
    btn.style.background = btn.classList.contains('active') ? 'white' : 'rgba(255,255,255,0.2)';
    btn.style.color = btn.classList.contains('active') ? '#333' : 'white';
}
function toggleKeypad(btn) { showToast("لوحة الأرقام مغلقة"); }
function toggleSpeaker(btn) { toggleMute(btn); }

// ==========================================
// 5. الرسائل والتحويلات
// ==========================================
function openCompose() { document.getElementById('screen-compose').classList.remove('hidden'); }
function closeCompose() { document.getElementById('screen-compose').classList.add('hidden'); }
function sendMessage() { showToast("تم إرسال الرسالة"); closeCompose(); }

function processTransfer() {
    const to = document.getElementById('transfer-to').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    if (!to || amount <= 0) { showToast("بيانات غير صحيحة"); return; }
    if (amount > appState.balance) { showToast("رصيد غير كافٍ"); return; }
    appState.balance -= amount;
    appState.transactions.unshift({ type: `تحويل لـ ${to}`, amount: -amount, date: new Date().toLocaleTimeString() });
    document.getElementById('transfer-to').value = ""; document.getElementById('transfer-amount').value = "";
    updateBalanceDisplay(); updateReports(); showToast("تم التحويل بنجاح"); goBack();
}

function updateReports() {
    document.getElementById('reports-financial-list').innerHTML = appState.transactions.map(t => `<tr><td>${t.type}</td><td style="font-size:0.8rem; color:#777;">${t.date}</td><td style="color: ${t.amount < 0 ? 'red' : 'green'}; font-weight:bold;">$${Math.abs(t.amount).toFixed(2)}</td></tr>`).join('');
    document.getElementById('reports-calls-list').innerHTML = appState.callHistory.map(c => `<tr><td>${c.name}</td><td>${c.duration}</td><td style="color:red;">$${c.cost}</td></tr>`).join('');
}

function openWhatsApp() { window.open('https://wa.me/967736962744', '_blank'); }

// ==========================================
// 6. PayPal Integration
// ==========================================
function initPayPal() {
    if (window.paypal) {
        paypal.Buttons({
            style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal' },
            createOrder: function(data, actions) {
                const amountInput = document.getElementById('paypal-amount').value;
                if (!amountInput || parseFloat(amountInput) <= 0) {
                    showToast("يرجى إدخال مبلغ صحيح");
                    return Promise.reject("Invalid Amount");
                }
                return actions.order.create({ purchase_units: [{ amount: { value: amountInput } }] });
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(function(details) {
                    const amountPaid = document.getElementById('paypal-amount').value;
                    const finalAmount = parseFloat(amountPaid);
                    
                    // ربط UID (محاكاة)
                    const uid = appState.currentUser ? appState.currentUser.uid : "guest";
                    console.log(`Processing PayPal payment for UID: ${uid}`);

                    appState.balance += finalAmount;
                    appState.transactions.unshift({ type: 'شحن PayPal', amount: finalAmount, date: new Date().toLocaleTimeString() });
                    
                    updateBalanceDisplay();
                    updateReports();
                    showToast(`تم الشحن بنجاح! الرصيد: $${appState.balance.toFixed(2)}`);
                    document.getElementById('paypal-amount').value = "";
                    setTimeout(() => { goBack(); }, 1500);
                });
            },
            onCancel: function (data) { showToast("تم إلغاء عملية الدفع"); },
            onError: function (err) { console.error(err); showToast("حدث خطأ في الدفع، حاول مرة أخرى"); }
        }).render('#paypal-button-container');
    } else {
        console.error("PayPal SDK failed to load.");
    }
}

// ==========================================
// تصدير الدوال للاستخدام في HTML (Global Scope)
// ==========================================
window.grantAllPermissions = grantAllPermissions;
window.firebaseAuth = firebaseAuth;
window.switchMainTab = switchMainTab;
window.navigateTo = navigateTo;
window.goBack = goBack;
window.switchTabContent = switchTabContent;
window.dial = dial;
window.deleteDigit = deleteDigit;
window.toggleAliasInput = toggleAliasInput;
window.updateAliasValue = updateAliasValue;
window.initiateCall = initiateCall;
window.endCall = endCall;
window.toggleMute = toggleMute;
window.toggleKeypad = toggleKeypad;
window.toggleSpeaker = toggleSpeaker;
window.openCompose = openCompose;
window.closeCompose = closeCompose;
window.sendMessage = sendMessage;
window.processTransfer = processTransfer;
window.openWhatsApp = openWhatsApp;