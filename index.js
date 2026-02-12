import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, collection, addDoc, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 1. إعدادات Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyD8hrO2kX1zXaA46PImzMGqOt4iTwhXKI0",
    authDomain: "call-now-24582.firebaseapp.com",
    projectId: "call-now-24582",
    storageBucket: "call-now-24582.firebasestorage.app",
    messagingSenderId: "982107544824",
    appId: "1:982107544824:web:c5b6806042ba44ff896f0d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 2. إعدادات Twilio ---
const TWILIO_CREDS = {
    accountSid: "AC556940721ff0c319d28a2b7e89ee4b78",
    apiKeySid: "SKfdd4fe38d4b4a70a8bcc14e0fb128b79",
    apiKeySecret: "Tm50wjJYwoCoZ84iyifLKd7CdnkCGn6T",
    twimlAppSid: "APXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" // ضع الـ SID الخاص بك هنا
};

// متغيرات الحالة
let device = null;
let activeConnection = null;
let callTimerInterval = null;
let currentNumber = "";
let callSeconds = 0;
let currentUser = null;
let currentBalance = 0;
let aliasName = "";

// ================= نظام إدارة الشاشات والأذونات =================

// مراقب حالة المستخدم
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('permission-screen').style.display = 'none';
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        loadUserProfile(user);
        loadCallHistory(user);
        initTwilio(user.uid);
        renderDummyData(); // تحميل بيانات وهمية للواجهات غير المربوطة
        initPayPal(); // تفعيل زر الدفع
    } else {
        if(localStorage.getItem('permsGranted') === 'true') {
             document.getElementById('permission-screen').style.display = 'none';
             document.getElementById('login-screen').classList.remove('hidden');
        }
    }
});

// 1. طلب الأذونات
window.grantAllPermissions = async () => {
    const btn = document.getElementById('btn-grant');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
    
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const icon = document.querySelector('#perm-mic .status-icon');
        icon.className = "status-icon fas fa-check-circle";
        icon.style.color = "#4CAF50";
        
        localStorage.setItem('permsGranted', 'true');
        
        setTimeout(() => {
            document.getElementById('permission-screen').style.display = 'none';
            if(!auth.currentUser) document.getElementById('login-screen').classList.remove('hidden');
        }, 1000);
        
    } catch (e) {
        btn.innerHTML = 'فشل الإذن - حاول مجدداً';
        btn.style.background = '#F44336';
        showToast("يجب السماح بالمايكروفون للاتصال");
    }
};

// 2. تسجيل الدخول
window.handleLogin = () => {
    const check = document.getElementById('terms-checkbox');
    if(!check.checked) return showToast("يجب الموافقة على الشروط أولاً");

    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(err => showToast(err.message));
};

window.handleLogout = () => signOut(auth).then(() => location.reload());

// ================= البيانات والواجهة =================

function loadUserProfile(user) {
    document.getElementById('profile-name').innerText = user.displayName;
    document.getElementById('profile-email').innerText = user.email;
    document.getElementById('profile-img').src = user.photoURL;

    const userRef = doc(db, "users", user.uid);
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            currentBalance = docSnap.data().balance;
            const formatted = `$${currentBalance.toFixed(2)}`;
            document.getElementById('main-balance-btn').innerText = formatted + " >";
        } else {
            setDoc(userRef, { balance: 1.00, email: user.email });
        }
    });
}

async function loadCallHistory(user) {
    const q = query(collection(db, `users/${user.uid}/history`), orderBy("date", "desc"), limit(20));
    const querySnapshot = await getDocs(q);
    const list = document.getElementById('recents-list');
    list.innerHTML = "";
    
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        const date = new Date(data.date.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const html = `
        <div class="list-item">
            <div style="width:40px; height:40px; background:#eee; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:#555">
                <i class="fas fa-phone"></i>
            </div>
            <div style="flex:1; margin-right:15px">
                <div style="font-weight:bold">${data.number}</div>
                <div style="font-size:0.8rem; color:#777">${date} • ${data.duration}s</div>
            </div>
            <div style="color:${data.cost > 0 ? 'red' : 'green'}">$${data.cost}</div>
        </div>`;
        list.innerHTML += html;
    });
}

function renderDummyData() {
    // جهات اتصال وهمية للتصميم
    const contacts = ["أحمد محمد", "سارة علي", "العمل", "خالد", "أمي"];
    document.getElementById('contacts-list').innerHTML = contacts.map(c => 
        `<div class="list-item"><div class="more-icon" style="background:#eee;color:#555"><i class="fas fa-user"></i></div><div style="flex:1"><div style="font-weight:bold">${c}</div><div style="font-size:0.8rem;color:#777">05XXXXXXX</div></div></div>`
    ).join('');
    
    // رسائل وهمية للتصميم
    document.getElementById('messages-list').innerHTML = 
        `<div class="list-item"><div class="more-icon" style="background:#eee;color:#555"><i class="fas fa-envelope"></i></div><div style="flex:1"><div style="font-weight:bold">الشركة</div><div style="font-size:0.8rem;color:#777">مرحباً بك في التطبيق...</div></div></div>`;
}

// ================= منطق الاتصال (Twilio) =================

function generateToken(userUid) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        jti: TWILIO_CREDS.apiKeySid + '-' + now,
        iss: TWILIO_CREDS.apiKeySid,
        sub: TWILIO_CREDS.accountSid,
        exp: now + 3600,
        grants: {
            voice: { outgoing: { application_sid: TWILIO_CREDS.twimlAppSid }, incoming: { allow: true } },
            identity: userUid
        }
    };
    return KJUR.jws.JWS.sign("HS256", JSON.stringify(header), JSON.stringify(payload), TWILIO_CREDS.apiKeySecret);
}

function initTwilio(uid) {
    try {
        const token = generateToken(uid);
        device = new Twilio.Device(token, { codecPreferences: ['opus', 'pcmu'] });

        device.on('ready', () => {
            const ind = document.getElementById('network-status');
            ind.classList.add('status-ready');
            ind.querySelector('span').innerText = "متصل بالشبكة";
            ind.querySelector('.dot').style.background = "#4CAF50";
        });
        
        device.on('error', (err) => { console.error(err); });
    } catch (e) { console.error(e); }
}

// لوحة المفاتيح
window.dial = (num) => {
    if (currentNumber.length < 15) {
        currentNumber += num;
        document.getElementById('dial-display').innerText = currentNumber;
    }
};

window.deleteDigit = () => {
    currentNumber = currentNumber.slice(0, -1);
    document.getElementById('dial-display').innerText = currentNumber;
};

window.toggleAliasInput = () => {
    const check = document.getElementById('anon-toggle');
    document.getElementById('alias-input-wrapper').style.display = check.checked ? 'block' : 'none';
};

window.updateAliasValue = () => aliasName = document.getElementById('alias-input-field').value;

// إجراء المكالمة
window.initiateCall = () => {
    if (!currentNumber) return showToast("أدخل الرقم أولاً");
    if (!device) return showToast("جاري الاتصال بالسيرفر...");
    if (currentBalance <= 0) return showToast("رصيدك غير كافٍ");

    document.getElementById('screen-active-call').classList.add('active');
    
    const displayName = (document.getElementById('anon-toggle').checked && aliasName) ? aliasName : currentNumber;
    document.getElementById('active-caller-name').innerText = displayName;

    const params = { To: currentNumber };
    activeConnection = device.connect(params);

    activeConnection.on('accept', () => {
        document.getElementById('call-status-text').innerText = "متصل";
        startCallTimer();
    });

    activeConnection.on('disconnect', () => endCall());
};

window.endCall = async () => {
    if (activeConnection) activeConnection.disconnect();
    document.getElementById('screen-active-call').classList.remove('active');
    stopCallTimer();
    
    if (callSeconds > 0 && currentUser) {
        const cost = (callSeconds / 60) * 0.10; 
        const newBal = currentBalance - cost;
        
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { balance: newBal });
        
        await addDoc(collection(db, `users/${currentUser.uid}/history`), {
            number: currentNumber,
            duration: callSeconds,
            cost: cost.toFixed(2),
            date: new Date()
        });
        
        showToast(`تم خصم $${cost.toFixed(2)}`);
        loadCallHistory(currentUser);
    }

    callSeconds = 0;
    document.getElementById('call-timer').innerText = "00:00";
    document.getElementById('call-status-text').innerText = "جاري الاتصال...";
};

window.toggleMute = () => {
    if (activeConnection) {
        const muted = activeConnection.isMuted();
        activeConnection.mute(!muted);
        showToast(muted ? "تم تشغيل المايك" : "تم كتم الصوت");
    }
};

function startCallTimer() {
    callSeconds = 0;
    callTimerInterval = setInterval(() => {
        callSeconds++;
        const m = Math.floor(callSeconds/60).toString().padStart(2,'0');
        const s = (callSeconds%60).toString().padStart(2,'0');
        document.getElementById('call-timer').innerText = `${m}:${s}`;
    }, 1000);
}

function stopCallTimer() { clearInterval(callTimerInterval); }

// ================= PayPal الدفع الحقيقي =================

function initPayPal() {
    if (window.paypal) {
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = ""; 
        
        paypal.Buttons({
            style: { layout: 'horizontal', color: 'blue', shape: 'rect', label: 'paypal', height: 40 },
            createOrder: function(data, actions) {
                const amount = document.getElementById('paypal-amount').value;
                if(!amount || amount <= 0) { showToast("أدخل مبلغ صحيح"); return; }
                return actions.order.create({
                    purchase_units: [{ amount: { value: amount } }]
                });
            },
            onApprove: function(data, actions) {
                return actions.order.capture().then(async function(details) {
                    const amountPaid = parseFloat(details.purchase_units[0].amount.value);
                    const newBal = currentBalance + amountPaid;
                    
                    // تحديث قاعدة بيانات Firebase
                    const userRef = doc(db, "users", currentUser.uid);
                    await updateDoc(userRef, { balance: newBal });
                    
                    showToast(`تم الشحن بنجاح: $${amountPaid}`);
                    setTimeout(() => goBack(), 1500);
                });
            },
            onError: (err) => showToast("فشلت عملية الدفع")
        }).render('#paypal-button-container');
    }
}

window.processTransfer = async () => {
    const toID = document.getElementById('transfer-to').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    
    if(!toID || amount <= 0) return showToast("بيانات خاطئة");
    if(amount > currentBalance) return showToast("رصيد غير كافٍ");
    
    // ملاحظة: التحويل الحقيقي يتطلب البحث عن User ID للطرف الآخر، 
    // هنا سنقوم فقط بخصم المبلغ من المرسل كمثال عملي.
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, { balance: currentBalance - amount });
    
    showToast(`تم تحويل $${amount} بنجاح`);
    goBack();
};

// ================= التنقل =================

window.switchMainTab = (screenId, el) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
};

window.navigateTo = (pageId) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
};

window.goBack = () => window.switchMainTab('screen-more', document.querySelectorAll('.nav-item')[3]);

window.showToast = (msg) => {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
};
