// ============================================
// VELARO v2 – Complete App Logic
// ============================================

import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc, addDoc,
  collection, query, where, getDocs,
  orderBy, serverTimestamp, increment, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============ UTILS ============
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => { t.className = "toast"; }, 3000);
}

function generateRef() {
  return "VLR" + Math.random().toString(36).substring(2, 7).toUpperCase();
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
}

function firebaseError(code) {
  const map = {
    "auth/email-already-in-use": "Email already in use",
    "auth/invalid-email": "Invalid email",
    "auth/weak-password": "Password too weak (min 6 chars)",
    "auth/user-not-found": "User not found",
    "auth/wrong-password": "Wrong password",
    "auth/invalid-credential": "Invalid email or password"
  };
  return map[code] || "Something went wrong";
}

// ============ AUTH UI ============
window.switchTab = function(tab, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
  document.getElementById(`${tab}Form`).classList.add("active");
  btn.classList.add("active");
};

window.togglePass = function(id, icon) {
  const inp = document.getElementById(id);
  if (!inp) return;
  if (inp.type === "password") {
    inp.type = "text";
    icon.classList.replace("fa-eye", "fa-eye-slash");
  } else {
    inp.type = "password";
    icon.classList.replace("fa-eye-slash", "fa-eye");
  }
};

// ============ SIGNUP ============
window.signupUser = async function() {
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const referral = document.getElementById("referralInput").value.trim();
  const loader = document.getElementById("signupLoader");

  if (!email || !password) return showToast("Fill all fields", "error");
  if (password.length < 6) return showToast("Password min 6 characters", "error");

  loader.classList.remove("hidden");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const refCode = generateRef();

    let referredBy = null;
    if (referral) {
      const refQ = query(collection(db, "users"), where("referralCode", "==", referral));
      const refSnap = await getDocs(refQ);
      if (!refSnap.empty) {
        referredBy = refSnap.docs[0].id;
        await updateDoc(doc(db, "users", referredBy), {
          balance: increment(100),
          teamEarnings: increment(100)
        });
        await addDoc(collection(db, "transactions"), {
          userId: referredBy,
          type: "referral_bonus",
          amount: 100,
          note: `Referral bonus from ${email}`,
          createdAt: serverTimestamp()
        });
      }
    }

    await setDoc(doc(db, "users", uid), {
      uid, email,
      displayName: "",
      balance: 0,
      role: "user",
      referralCode: refCode,
      referredBy,
      totalDeposit: 0,
      totalWithdraw: 0,
      totalProfit: 0,
      teamEarnings: 0,
      blocked: false,
      wallet: { method: "", number: "", name: "" },
      createdAt: serverTimestamp()
    });

    showToast("Account created!", "success");
    setTimeout(() => window.location.href = "dashboard.html", 1200);
  } catch (e) {
    loader.classList.add("hidden");
    showToast(firebaseError(e.code), "error");
  }
};

// ============ LOGIN ============
window.loginUser = async function() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const loader = document.getElementById("loginLoader");

  if (!email || !password) return showToast("Fill all fields", "error");
  loader.classList.remove("hidden");

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    loader.classList.add("hidden");
    showToast(firebaseError(e.code), "error");
  }
};

// ============ LOGOUT ============
window.logoutUser = async function() {
  await signOut(auth);
  window.location.href = "index.html";
};

// ============ PAGE DETECT ============
const page = window.location.pathname;

onAuthStateChanged(auth, async (user) => {
  if (page.includes("index.html") || page.endsWith("/") || page.endsWith("Velaro") || page.endsWith("Velaro/")) {
    if (user) {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      if (uSnap.exists()) {
        window.location.href = uSnap.data().role === "admin" ? "admin.html" : "dashboard.html";
      }
    }
    return;
  }

  if (page.includes("dashboard.html")) {
    if (!user) return (window.location.href = "index.html");
    const uSnap = await getDoc(doc(db, "users", user.uid));
    if (!uSnap.exists()) return (window.location.href = "index.html");
    const userData = uSnap.data();
    if (userData.blocked) { await signOut(auth); return (window.location.href = "index.html"); }
    if (userData.role === "admin") return (window.location.href = "admin.html");
    loadDashboard(user, userData);
    return;
  }

  if (page.includes("admin.html")) {
    if (!user) return (window.location.href = "index.html");
    const uSnap = await getDoc(doc(db, "users", user.uid));
    if (!uSnap.exists() || uSnap.data().role !== "admin") return (window.location.href = "dashboard.html");
    loadAdmin();
    return;
  }
});

// ============ DASHBOARD ============
let currentUser = null;
let currentData = null;
let selectedWalletMethod = "";

async function loadDashboard(user, userData) {
  currentUser = user;
  currentData = userData;

  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("dashApp").classList.remove("hidden");

  const name = userData.displayName || userData.email.split("@")[0];
  document.getElementById("headerEmail").textContent = name;
  document.getElementById("userAvatar").textContent = name[0].toUpperCase();

  document.getElementById("walletBalance").textContent = userData.balance || 0;
  document.getElementById("walletUID").textContent = user.uid.substring(0, 8).toUpperCase();
  document.getElementById("walletRef").innerHTML = `${userData.referralCode} <i class="fa fa-copy" style="font-size:11px"></i>`;
  document.getElementById("rewardCode").textContent = userData.referralCode;

  document.getElementById("statDeposit").textContent = `Rs ${userData.totalDeposit || 0}`;
  document.getElementById("statWithdraw").textContent = `Rs ${userData.totalWithdraw || 0}`;
  document.getElementById("statProfit").textContent = `Rs ${userData.totalProfit || 0}`;
  document.getElementById("statTeam").textContent = `Rs ${userData.teamEarnings || 0}`;

  // Profile modal
  document.getElementById("profileAvatar").textContent = name[0].toUpperCase();
  document.getElementById("profileEmail").textContent = userData.email;
  document.getElementById("profileUID").textContent = user.uid.substring(0, 12).toUpperCase();
  document.getElementById("profileRef").textContent = userData.referralCode;
  document.getElementById("profileDate").textContent = formatDate(userData.createdAt);
  if (userData.displayName) document.getElementById("profileName").value = userData.displayName;

  loadDepositInfo();
  loadPlans(userData);
  loadTeam();
  loadTransactions(user.uid);
  startProfitTimer();
}

// PROFIT TIMER — countdown to next midnight
function startProfitTimer() {
  function update() {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    let diff = Math.floor((midnight - now) / 1000);
    const h = Math.floor(diff / 3600);
    diff %= 3600;
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    const pad = n => String(n).padStart(2, "0");
    document.getElementById("timerH").textContent = pad(h);
    document.getElementById("timerM").textContent = pad(m);
    document.getElementById("timerS").textContent = pad(s);
  }
  update();
  setInterval(update, 1000);
}

// DEPOSIT INFO from admin settings
async function loadDepositInfo() {
  try {
    const snap = await getDoc(doc(db, "settings", "deposit"));
    if (snap.exists()) {
      const d = snap.data();
      let info = "Send payment to:\n";
      if (d.EasyPaisa?.number) info += `📱 EasyPaisa: ${d.EasyPaisa.number} (${d.EasyPaisa.name})\n`;
      if (d.JazzCash?.number) info += `📱 JazzCash: ${d.JazzCash.number} (${d.JazzCash.name})\n`;
      if (d.Bank?.number) info += `🏦 Bank: ${d.Bank.number} (${d.Bank.name})`;
      const el = document.getElementById("depositInfo");
      if (el) el.innerHTML = info.replace(/\n/g, "<br>");
    } else {
      const el = document.getElementById("depositInfo");
      if (el) el.textContent = "Contact support for deposit account details.";
    }
  } catch(e) {}
}

// PLANS
async function loadPlans(userData) {
  const plansList = document.getElementById("plansList");
  plansList.innerHTML = "";

  const plansSnap = await getDocs(collection(db, "plans"));
  if (plansSnap.empty) {
    plansList.innerHTML = `<div class="empty-state"><i class="fa fa-chart-line"></i><p>No plans available yet</p></div>`;
    return;
  }

  const activeQ = query(collection(db, "userPlans"), where("userId", "==", currentUser.uid), where("status", "==", "active"));
  const activeSnap = await getDocs(activeQ);
  const activePlanIds = activeSnap.docs.map(d => d.data().planId);

  plansSnap.forEach(planDoc => {
    const plan = planDoc.data();
    const isActive = activePlanIds.includes(planDoc.id);
    const card = document.createElement("div");
    card.className = "plan-card";
    card.innerHTML = `
      <div class="plan-info">
        <h4>${plan.name}</h4>
        <p>Investment: <strong style="color:var(--text)">Rs ${plan.amount}</strong></p>
        <p>Duration: ${plan.days} days</p>
        <p class="plan-profit">+Rs ${plan.dailyProfit}/day</p>
      </div>
      <button class="plan-btn ${isActive ? 'active-plan' : ''}"
        ${isActive ? 'disabled' : ''}
        onclick="activatePlan('${planDoc.id}', ${plan.amount}, ${plan.dailyProfit}, ${plan.days})">
        ${isActive ? '✓ Active' : 'Invest'}
      </button>
    `;
    plansList.appendChild(card);
  });
}

window.activatePlan = async function(planId, amount, dailyProfit, days) {
  const uSnap = await getDoc(doc(db, "users", currentUser.uid));
  const balance = uSnap.data().balance;
  if (balance < amount) return showToast("Insufficient balance", "error");

  try {
    await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(-amount) });
    await addDoc(collection(db, "userPlans"), {
      userId: currentUser.uid, planId, amount, dailyProfit, days,
      daysRemaining: days, status: "active", lastProfitDate: null,
      createdAt: serverTimestamp()
    });
    await addDoc(collection(db, "transactions"), {
      userId: currentUser.uid, type: "plan_activation",
      amount: -amount, note: "Plan activated", createdAt: serverTimestamp()
    });
    showToast("Plan activated!", "success");
    setTimeout(() => location.reload(), 1200);
  } catch (e) { showToast("Error activating plan", "error"); }
};

// TEAM
async function loadTeam() {
  const teamList = document.getElementById("teamList");
  teamList.innerHTML = "";
  const teamQ = query(collection(db, "users"), where("referredBy", "==", currentUser.uid));
  const teamSnap = await getDocs(teamQ);

  if (teamSnap.empty) {
    teamList.innerHTML = `<div class="empty-state"><i class="fa fa-users"></i><p>No team members yet. Share your referral code!</p></div>`;
    return;
  }
  teamSnap.forEach(d => {
    const m = d.data();
    const item = document.createElement("div");
    item.className = "team-item";
    item.innerHTML = `
      <div class="team-avatar">${m.email[0].toUpperCase()}</div>
      <div>
        <p class="team-email">${m.displayName || m.email}</p>
        <p class="team-date">Joined: ${formatDate(m.createdAt)}</p>
      </div>
    `;
    teamList.appendChild(item);
  });
}

// TRANSACTIONS
async function loadTransactions(uid) {
  const txList = document.getElementById("txList");
  txList.innerHTML = "";
  try {
    const txQ = query(collection(db, "transactions"), where("userId", "==", uid), orderBy("createdAt", "desc"));
    const txSnap = await getDocs(txQ);
    if (txSnap.empty) {
      txList.innerHTML = `<div class="empty-state"><i class="fa fa-history"></i><p>No transactions yet</p></div>`;
      return;
    }
    txSnap.forEach(d => {
      const tx = d.data();
      const isCredit = tx.amount > 0;
      const item = document.createElement("div");
      item.className = "tx-item";
      item.innerHTML = `
        <div>
          <p class="tx-type">${formatTxType(tx.type)}</p>
          <p class="tx-meta">${tx.note || ""} · ${formatDate(tx.createdAt)}</p>
        </div>
        <p class="tx-amount ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : ''}Rs ${Math.abs(tx.amount)}</p>
      `;
      txList.appendChild(item);
    });
  } catch(e) {
    txList.innerHTML = `<div class="empty-state"><p>Could not load. Please wait for Firestore index.</p></div>`;
  }
}

function formatTxType(type) {
  const map = {
    deposit: "Deposit", withdraw: "Withdrawal", plan_activation: "Plan Activated",
    daily_profit: "Daily Profit", referral_bonus: "Referral Bonus",
    admin_credit: "Admin Credit", admin_debit: "Admin Debit"
  };
  return map[type] || type;
}

// SECTION TOGGLE
window.showSection = function(id) {
  ["teamSection","rewardsSection","txSection"].forEach(s => {
    document.getElementById(s)?.classList.add("hidden");
  });
  document.getElementById(id)?.classList.remove("hidden");
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
};

// COPY REF
window.copyRef = function() {
  if (!currentData) return;
  navigator.clipboard.writeText(currentData.referralCode)
    .then(() => showToast("Referral code copied!", "success"))
    .catch(() => showToast("Code: " + currentData.referralCode));
};

// MODALS
window.openModal = function(id) { document.getElementById(id).classList.remove("hidden"); };
window.closeModal = function(id) { document.getElementById(id).classList.add("hidden"); };

// DEPOSIT
window.submitDeposit = async function() {
  const amount = Number(document.getElementById("depositAmount").value);
  const method = document.getElementById("depositMethod").value.trim();
  const txId = document.getElementById("depositTxId").value.trim();
  if (!amount || amount < 100) return showToast("Min deposit Rs 100", "error");
  if (!method || !txId) return showToast("Fill all fields", "error");
  try {
    await addDoc(collection(db, "deposits"), {
      userId: currentUser.uid, email: currentData.email,
      amount, method, txId, status: "pending", createdAt: serverTimestamp()
    });
    closeModal("depositModal");
    showToast("Deposit submitted! Awaiting approval.", "success");
  } catch(e) { showToast("Error submitting", "error"); }
};

// WITHDRAW
window.submitWithdraw = async function() {
  const amount = Number(document.getElementById("withdrawAmount").value);
  const account = document.getElementById("withdrawAccount").value.trim();
  const method = document.getElementById("withdrawMethod").value.trim();
  if (!amount || amount < 200) return showToast("Min withdraw Rs 200", "error");
  if (!account || !method) return showToast("Fill all fields", "error");
  const uSnap = await getDoc(doc(db, "users", currentUser.uid));
  if (uSnap.data().balance < amount) return showToast("Insufficient balance", "error");
  try {
    await addDoc(collection(db, "withdraws"), {
      userId: currentUser.uid, email: currentData.email,
      amount, account, method, status: "pending", createdAt: serverTimestamp()
    });
    closeModal("withdrawModal");
    showToast("Withdrawal submitted! Awaiting approval.", "success");
  } catch(e) { showToast("Error submitting", "error"); }
};

// PROFILE SAVE
window.saveProfile = async function() {
  const name = document.getElementById("profileName").value.trim();
  if (!name) return showToast("Enter a name", "error");
  try {
    await updateDoc(doc(db, "users", currentUser.uid), { displayName: name });
    showToast("Name saved!", "success");
    document.getElementById("headerEmail").textContent = name;
    document.getElementById("userAvatar").textContent = name[0].toUpperCase();
    document.getElementById("profileAvatar").textContent = name[0].toUpperCase();
    closeModal("profileModal");
  } catch(e) { showToast("Error saving", "error"); }
};

// WALLET BIND
window.selectWalletMethod = function(method) {
  selectedWalletMethod = method;
  document.querySelectorAll(".wallet-method-btn").forEach(b => b.classList.remove("selected"));
  const id = `wm-${method.toLowerCase().replace(" ", "")}`;
  document.getElementById(id)?.classList.add("selected");
};

window.saveWallet = async function() {
  const number = document.getElementById("walletNumber").value.trim();
  const name = document.getElementById("walletName").value.trim();
  if (!selectedWalletMethod) return showToast("Select a method", "error");
  if (!number || !name) return showToast("Fill all fields", "error");
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      wallet: { method: selectedWalletMethod, number, name }
    });
    showToast("Wallet saved!", "success");
    closeModal("walletModal");
  } catch(e) { showToast("Error saving wallet", "error"); }
};

// ============ ADMIN ============

async function loadAdmin() {
  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("adminApp").classList.remove("hidden");
  loadAdminStats();
  loadAdminDeposits();
  loadDepositSettings();
}

window.adminTab = function(tab, btn) {
  document.querySelectorAll(".atab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".admin-section").forEach(s => s.classList.add("hidden"));
  btn.classList.add("active");
  document.getElementById(`admin${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.remove("hidden");
  if (tab === "deposits") loadAdminDeposits();
  else if (tab === "withdraws") loadAdminWithdraws();
  else if (tab === "users") loadAdminUsers();
  else if (tab === "plans") loadAdminPlans();
  else if (tab === "settings") loadDepositSettings();
};

async function loadAdminStats() {
  const usersSnap = await getDocs(collection(db, "users"));
  let totalDep = 0, totalWith = 0, totalProfit = 0;
  usersSnap.forEach(d => {
    const u = d.data();
    totalDep += u.totalDeposit || 0;
    totalWith += u.totalWithdraw || 0;
    totalProfit += u.totalProfit || 0;
  });
  document.getElementById("aStatUsers").textContent = usersSnap.size;
  document.getElementById("aStatDeposits").textContent = `Rs ${totalDep}`;
  document.getElementById("aStatWithdraws").textContent = `Rs ${totalWith}`;
  document.getElementById("aStatProfit").textContent = `Rs ${totalProfit}`;
}

async function loadAdminDeposits() {
  const list = document.getElementById("depositsList");
  list.innerHTML = "";
  try {
    const q = query(collection(db, "deposits"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = `<div class="empty-state"><i class="fa fa-check-circle"></i><p>No pending deposits</p></div>`; return; }
    snap
