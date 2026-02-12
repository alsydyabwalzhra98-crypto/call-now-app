// استيراد المكتبات الأساسية
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, collection, addDoc, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. إعدادات Firebase
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

// 2. إعدادات Twilio
const TWILIO_CREDS = {
    accountSid: "AC556940721ff0c319d28a2b7e89ee4b78",
    apiKeySid: "SKfdd4fe38d4b4a70a8bcc14e0fb128b79",
    apiKeySecret: "Tm50wjJYwoCoZ84iyifLKd7CdnkCGn6T",
    // !!! استبدل هذا بالـ SID الخاص بك من موقع Twilio !!!
    twimlAppSid: "APXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" 
};

let device = null;
let activeConnection = null;
let callTimerInterval = null;
let currentNumber = "";
let callSeconds = 0;
let currentUser = null;
let currentBalance = 0;

// ================= نظام إدارة الشاشات والأذونات =================

// مراقبة حالة الدخول
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        // المستخدم مسجل دخوله
        document.getElementById('permissions-screen').style.display = 'none';
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        loadUserProfile(user);
        loadCallHistory(user);
        initTwilio(user.uid);
    } else {
        // المستخدم غير مسجل، نظهر الأذونات أولاً إذا لم تُمنح
        if(localStorage.getItem('permsGranted') === 'true') {
             document.getElementById('permissions-screen').style.display = 'none';
             document.getElementById('login-screen').classList.remove('hidden');
        }
    }
});

// طلب الأذونات الحقيقية
window.requestPermissions = async () => {
    const btn = document.getElementById('btn-grant');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
    
    try {
        // طلب إذن المايكروفون فعلياً من المتصفح
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // تغيير الأيقونة للأخضر
        const icon = document.querySelector('#perm-mic .status-icon');
        icon.className = "status-icon fas fa-check-circle";
        icon.style.color = "#4CAF50";
        
        localStorage.setItem('permsGranted', 'true');
        
        setTimeout(() => {
            document.getElementById('permissions-screen').style.display = 'none';
            if(!auth.currentUser) document.getElementById('login-screen').classList.remove('hidden');
        }, 1000);
        
    } catch (e) {
        btn.innerHTML = 'فشل الإذن - حاول مجدداً';
        btn.style.background = '#F44336';
        showToast("يجب السماح بالمايكروفون للاتصال");
    }
};

// تسجيل الدخول
window.loginWithGoogle = () => {
    const check = document.getElementById('terms-checkbox');
    if(!check.checked) return showToast("يجب الموافقة على الشروط أولاً");

    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(err => showToast(err.message));
};

window.userLogout = () => signOut(auth).then(() => location.reload());

// ================= البيانات والواجهة =================

function loadUserProfile(user) {
    document.getElementById('profile-name').innerText = user.displayName;
    document.getElementById('profile-email').innerText = user.email;
    document.getElementById('profile-img').src = user.photoURL;

    const userRef = doc(db, "users", user.uid);
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            currentBalance = docSnap.data().balance;
            document.getElementById('main-balance-btn').innerText = `$${currentBalance.toFixed(2)} >`;
        } else {
            setDoc(userRef, { balance: 2.00, email: user.email }); // رصيد هدية
        }
    });
}

// تحميل السجل من Firebase (بديل سجل الهاتف)
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
            voice: {
                outgoing: { application_sid: TWILIO_CREDS.twimlAppSid },
                incoming: { allow: true }
            },
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

        device.on('error', (err) => {
            console.error(err);
            if(err.code === 31205) showToast("تنبيه: تحقق من TwiML SID");
        });

    } catch (e) { console.error(e); }
}

// التعامل مع لوحة المفاتيح
window.addNumber = (num) => {
    if (currentNumber.length < 15) {
        currentNumber += num;
        document.getElementById('dial-display').innerText = currentNumber;
    }
};

window.deleteNumber = () => {
    currentNumber = currentNumber.slice(0, -1);
    document.getElementById('dial-display').innerText = currentNumber;
};

// منطق الاسم المستعار
window.toggleAliasInput = () => {
    const check = document.getElementById('anon-toggle');
    document.getElementById('alias-input-wrapper').style.display = check.checked ? 'block' : 'none';
};
let aliasName = "";
window.updateAliasValue = () => aliasName = document.getElementById('alias-input-field').value;

// إجراء المكالمة
window.startCall = () => {
    if (!currentNumber) return showToast("أدخل الرقم أولاً");
    if (!device) return showToast("جاري الاتصال بالسيرفر...");
    if (currentBalance <= 0) return showToast("رصيدك غير كافٍ");

    document.getElementById('screen-active-call').classList.add('active');
    
    // إظهار الاسم المستعار إذا تم تفعيله، أو الرقم
    const displayName = (document.getElementById('anon-toggle').checked && aliasName) ? aliasName : currentNumber;
    document.getElementById('active-caller-name').innerText = displayName;

    const params = { To: currentNumber };
    activeConnection = device.connect(params);

    activeConnection.on('accept', () => {
        document.getElementById('call-status-text').innerText = "متصل";
        startCallTimer();
    });

    activeConnection.on('disconnect', () => {
        endCall();
    });
};

window.endCall = async () => {
    if (activeConnection) activeConnection.disconnect();
    document.getElementById('screen-active-call').classList.remove('active');
    stopCallTimer();
    
    // حفظ المكالمة في السجل
    if (callSeconds > 0 && currentUser) {
        const cost = (callSeconds / 60) * 0.10; // افتراض 10 سنت للدقيقة
        const newBal = currentBalance - cost;
        
        // تحديث الرصيد والسجل في Firebase
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { balance: newBal });
        
        await addDoc(collection(db, `users/${currentUser.uid}/history`), {
            number: currentNumber,
            duration: callSeconds,
            cost: cost.toFixed(2),
            date: new Date()
        });
        
        showToast(`تم خصم $${cost.toFixed(2)}`);
        loadCallHistory(currentUser); // تحديث القائمة
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

// التنقل
window.switchTab = (screenId, el) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
};

window.showToast = (msg) => {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
};
