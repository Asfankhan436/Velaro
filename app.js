// ============================================
// VELARO – Complete App Logic
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
  orderBy, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============ UTILITIES ============

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

// ============ AUTH FUNCTIONS ============

window.switchTab = function(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
  document.querySelector(`#${tab}Form`).classList.add("active");
  event.target.classList.add("active");
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

window.signupUser = async function() {
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const referral = document.getElementById("referralInput").value.trim();
  const loader = document.getElementById("signupLoader");

  if (!email || !password) return showToast("Fill all fields", "error");
  if (password.length < 6) return showToast("Password must be 6+ characters", "error");

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
        // Add referral bonus to referrer
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
      uid,
      email,
      balance: 0,
      role: "user",
      referralCode: refCode,
      referredBy,
      totalDeposit: 0,
      totalWithdraw: 0,
      totalProfit: 0,
      teamEarnings: 0,
      blocked: false,
      createdAt: serverTimestamp()
    });

    showToast("Account created! Logging in...", "success");
    setTimeout(() => window.location.href = "dashboard.html", 1200);

  } catch (e) {
    loader.classList.add("hidden");
    showToast(firebaseError(e.code), "error");
  }
};

window.loginUser = async function() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const loader = document.getElementById("loginLoader");

  if (!email || !password) return showToast("Fill all fields", "error");
  loader.classList.remove("hidden");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles redirect
  } catch (e) {
    loader.classList.add("hidden");
    showToast(firebaseError(e.code), "error");
  }
};

window.logoutUser = async function() {
  await signOut(auth);
  window.location.href = "index.html";
};

function firebaseError(code) {
  const map = {
    "auth/email-already-in-use": "Email already in use",
    "auth/invalid-email": "Invalid email",
    "auth/weak-password": "Password too weak",
    "auth/user-not-found": "User not found",
    "auth/wrong-password": "Wrong password",
    "auth/invalid-credential": "Invalid credentials"
  };
  return map[code] || "Something went wrong";
}

// ============ DETECT PAGE ============

const page = window.location.pathname;

onAuthStateChanged(auth, async (user) => {
  if (page.includes("index.html") || page.endsWith("/")) {
    if (user) {
      const uSnap = await getDoc(doc(db, "users", user.uid));
      if (uSnap.exists()) {
        const role = uSnap.data().role;
        window.location.href = role === "admin" ? "admin.html" : "dashboard.html";
      }
    }
    return;
  }

  if (page.includes("dashboard.html")) {
    if (!user) return window.location.href = "index.html";
    const uSnap = await getDoc(doc(db, "users", user.uid));
    if (!uSnap.exists()) return window.location.href = "index.html";
    const userData = uSnap.data();
    if (userData.blocked) {
      await signOut(auth);
      return (window.location.href = "index.html");
    }
    if (userData.role === "admin") return (window.location.href = "admin.html");
    loadDashboard(user, userData);
    return;
  }

  if (page.includes("admin.html")) {
    if (!user) return window.location.href = "index.html";
    const uSnap = await getDoc(doc(db, "users", user.uid));
    if (!uSnap.exists() || uSnap.data().role !== "admin") {
      return window.location.href = "dashboard.html";
    }
    loadAdmin();
    return;
  }
});

// ============ DASHBOARD ============

let currentUser = null;
let currentData = null;

async function loadDashboard(user, userData) {
  currentUser = user;
  currentData = userData;

  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("dashApp").classList.remove("hidden");

  // Header
  document.getElementById("headerEmail").textContent = userData.email;
  document.getElementById("userAvatar").textContent = userData.email[0].toUpperCase();

  // Wallet
  document.getElementById("walletBalance").textContent = `Rs ${userData.balance || 0}`;
  document.getElementById("walletUID").textContent = user.uid.substring(0, 8).toUpperCase();
  document.getElementById("walletRef").textContent = userData.referralCode;
  document.getElementById("rewardCode").textContent = userData.referralCode;

  // Stats
  document.getElementById("statDeposit").textContent = `Rs ${userData.totalDeposit || 0}`;
  document.getElementById("statWithdraw").textContent = `Rs ${userData.totalWithdraw || 0}`;
  document.getElementById("statProfit").textContent = `Rs ${userData.totalProfit || 0}`;
  document.getElementById("statTeam").textContent = `Rs ${userData.teamEarnings || 0}`;

  // Load plans, team, transactions
  loadPlans(userData);
  loadTeam(userData);
  loadTransactions(user.uid);
}

// PLANS
async function loadPlans(userData) {
  const plansList = document.getElementById("plansList");
  plansList.innerHTML = "";

  const plansSnap = await getDocs(collection(db, "plans"));
  if (plansSnap.empty) {
    plansList.innerHTML = `<div class="empty-state"><i class="fa fa-chart-line"></i><p>No plans available</p></div>`;
    return;
  }

  // Get user's active plans
  const activeQ = query(collection(db, "userPlans"),
    where("userId", "==", currentUser.uid),
    where("status", "==", "active")
  );
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
        <p>Investment: Rs ${plan.amount}</p>
        <p>Duration: ${plan.days} days</p>
        <p class="plan-profit">Daily Profit: Rs ${plan.dailyProfit}</p>
      </div>
      <button class="plan-btn ${isActive ? 'active-plan' : ''}"
        ${isActive ? 'disabled' : ''}
        onclick="activatePlan('${planDoc.id}', ${plan.amount}, ${plan.dailyProfit}, ${plan.days})">
        ${isActive ? 'Active' : 'Invest'}
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
    await updateDoc(doc(db, "users", currentUser.uid), {
      balance: increment(-amount),
      totalDeposit: increment(amount)
    });

    await addDoc(collection(db, "userPlans"), {
      userId: currentUser.uid,
      planId,
      amount,
      dailyProfit,
      days,
      daysRemaining: days,
      status: "active",
      lastProfitDate: null,
      createdAt: serverTimestamp()
    });

    await addDoc(collection(db, "transactions"), {
      userId: currentUser.uid,
      type: "plan_activation",
      amount: -amount,
      note: `Plan activated`,
      createdAt: serverTimestamp()
    });

    showToast("Plan activated!", "success");
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    showToast("Error activating plan", "error");
  }
};

// TEAM
async function loadTeam(userData) {
  const teamList = document.getElementById("teamList");
  teamList.innerHTML = "";

  const teamQ = query(collection(db, "users"),
    where("referredBy", "==", currentUser.uid)
  );
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
        <p class="team-email">${m.email}</p>
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

  const txQ = query(collection(db, "transactions"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc")
  );

  try {
    const txSnap = await getDocs(txQ);
    if (txSnap.empty) {
      txList.innerHTML = `<div class="empty-state"><i class="fa fa-history"></i><p>No transactions yet</p></div>`;
      return;
    }
    txSnap.forEach(d => {
      const tx = d.data();
      const item = document.createElement("div");
      item.className = "tx-item";
      const isCredit = tx.amount > 0;
      item.innerHTML = `
        <div>
          <p class="tx-type">${formatTxType(tx.type)}</p>
          <p class="tx-meta">${tx.note || ""} · ${formatDate(tx.createdAt)}</p>
        </div>
        <p class="tx-amount ${isCredit ? 'credit' : 'debit'}">
          ${isCredit ? '+' : ''}Rs ${Math.abs(tx.amount)}
        </p>
      `;
      txList.appendChild(item);
    });
  } catch (e) {
    txList.innerHTML = `<div class="empty-state"><p>Could not load transactions</p></div>`;
  }
}

function formatTxType(type) {
  const map = {
    deposit: "Deposit",
    withdraw: "Withdrawal",
    plan_activation: "Plan Activated",
    daily_profit: "Daily Profit",
    referral_bonus: "Referral Bonus",
    admin_credit: "Admin Credit",
    admin_debit: "Admin Debit"
  };
  return map[type] || type;
}

// SECTION TOGGLE
window.showSection = function(id) {
  document.querySelectorAll(".section-block").forEach(s => {
    if (["teamSection", "rewardsSection", "txSection"].includes(s.id)) {
      s.classList.add("hidden");
    }
  });
  document.getElementById(id)?.classList.remove("hidden");
};

// COPY REFERRAL
window.copyRef = function() {
  if (!currentData) return;
  navigator.clipboard.writeText(currentData.referralCode)
    .then(() => showToast("Referral code copied!", "success"))
    .catch(() => showToast("Could not copy", "error"));
};

// MODAL
window.openModal = function(id) {
  document.getElementById(id).classList.remove("hidden");
};
window.closeModal = function(id) {
  document.getElementById(id).classList.add("hidden");
};

// DEPOSIT
window.submitDeposit = async function() {
  const amount = Number(document.getElementById("depositAmount").value);
  const method = document.getElementById("depositMethod").value.trim();
  const txId = document.getElementById("depositTxId").value.trim();

  if (!amount || amount < 100) return showToast("Minimum deposit Rs 100", "error");
  if (!method || !txId) return showToast("Fill all fields", "error");

  try {
    await addDoc(collection(db, "deposits"), {
      userId: currentUser.uid,
      email: currentData.email,
      amount,
      method,
      txId,
      status: "pending",
      createdAt: serverTimestamp()
    });
    closeModal("depositModal");
    showToast("Deposit request submitted!", "success");
  } catch (e) {
    showToast("Error submitting deposit", "error");
  }
};

// WITHDRAW
window.submitWithdraw = async function() {
  const amount = Number(document.getElementById("withdrawAmount").value);
  const account = document.getElementById("withdrawAccount").value.trim();
  const method = document.getElementById("withdrawMethod").value.trim();

  if (!amount || amount < 200) return showToast("Minimum withdraw Rs 200", "error");
  if (!account || !method) return showToast("Fill all fields", "error");

  const uSnap = await getDoc(doc(db, "users", currentUser.uid));
  const balance = uSnap.data().balance;
  if (balance < amount) return showToast("Insufficient balance", "error");

  try {
    await addDoc(collection(db, "withdraws"), {
      userId: currentUser.uid,
      email: currentData.email,
      amount,
      account,
      method,
      status: "pending",
      createdAt: serverTimestamp()
    });
    closeModal("withdrawModal");
    showToast("Withdrawal request submitted!", "success");
  } catch (e) {
    showToast("Error submitting withdrawal", "error");
  }
};

// ============ ADMIN ============

async function loadAdmin() {
  document.getElementById("loadingScreen").classList.add("hidden");
  document.getElementById("adminApp").classList.remove("hidden");

  adminTab("deposits");
  loadAdminStats();
}

window.adminTab = function(tab) {
  document.querySelectorAll(".atab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".admin-section").forEach(s => s.classList.add("hidden"));
  event.target.classList.add("active");
  document.getElementById(`admin${capitalize(tab)}`).classList.remove("hidden");

  if (tab === "deposits") loadAdminDeposits();
  else if (tab === "withdraws") loadAdminWithdraws();
  else if (tab === "users") loadAdminUsers();
  else if (tab === "plans") loadAdminPlans();
};

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

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
  const q = query(collection(db, "deposits"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
  try {
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = `<div class="empty-state"><i class="fa fa-check-circle"></i><p>No pending deposits</p></div>`; return; }
    snap.forEach(d => {
      const dep = d.data();
      const card = document.createElement("div");
      card.className = "admin-card";
      card.innerHTML = `
        <div class="admin-card-row">
          <div class="admin-card-info">
            <strong>${dep.email}</strong>
            <p>Amount: Rs ${dep.amount}</p>
            <p>Method: ${dep.method}</p>
            <p>TX ID: ${dep.txId}</p>
            <p>${formatDate(dep.createdAt)}</p>
          </div>
          <span class="badge badge-pending">Pending</span>
        </div>
        <div class="admin-card-actions">
          <button class="btn-approve" onclick="approveDeposit('${d.id}', '${dep.userId}', ${dep.amount})">Approve</button>
          <button class="btn-reject" onclick="rejectRequest('deposits', '${d.id}')">Reject</button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch(e) {
    list.innerHTML = `<div class="empty-state"><p>Index required. Check console.</p></div>`;
  }
}

window.approveDeposit = async function(depId, userId, amount) {
  try {
    await updateDoc(doc(db, "deposits", depId), { status: "approved" });
    await updateDoc(doc(db, "users", userId), {
      balance: increment(amount),
      totalDeposit: increment(amount)
    });
    await addDoc(collection(db, "transactions"), {
      userId,
      type: "deposit",
      amount,
      note: "Deposit approved",
      createdAt: serverTimestamp()
    });
    showToast("Deposit approved!", "success");
    loadAdminDeposits();
    loadAdminStats();
  } catch(e) { showToast("Error", "error"); }
};

async function loadAdminWithdraws() {
  const list = document.getElementById("withdrawsList");
  list.innerHTML = "";
  const q = query(collection(db, "withdraws"), where("status", "==", "pending"), orderBy("createdAt", "desc"));
  try {
    const snap = await getDocs(q);
    if (snap.empty) { list.innerHTML = `<div class="empty-state"><i class="fa fa-check-circle"></i><p>No pending withdrawals</p></div>`; return; }
    snap.forEach(d => {
      const w = d.data();
      const card = document.createElement("div");
      card.className = "admin-card";
      card.innerHTML = `
        <div class="admin-card-row">
          <div class="admin-card-info">
            <strong>${w.email}</strong>
            <p>Amount: Rs ${w.amount}</p>
            <p>Account: ${w.account}</p>
            <p>Method: ${w.method}</p>
            <p>${formatDate(w.createdAt)}</p>
          </div>
          <span class="badge badge-pending">Pending</span>
        </div>
        <div class="admin-card-actions">
          <button class="btn-approve" onclick="approveWithdraw('${d.id}', '${w.userId}', ${w.amount})">Approve</button>
          <button class="btn-reject" onclick="rejectRequest('withdraws', '${d.id}')">Reject</button>
        </div>
      `;
      list.appendChild(card);
    });
  } catch(e) {
    list.innerHTML = `<div class="empty-state"><p>Index required. Check console.</p></div>`;
  }
}

window.approveWithdraw = async function(wId, userId, amount) {
  const uSnap = await getDoc(doc(db, "users", userId));
  if (uSnap.data().balance < amount) return showToast("User has insufficient balance", "error");

  try {
    await updateDoc(doc(db, "withdraws", wId), { status: "approved" });
    await updateDoc(doc(db, "users", userId), {
      balance: increment(-amount),
      totalWithdraw: increment(amount)
    });
    await addDoc(collection(db, "transactions"), {
      userId,
      type: "withdraw",
      amount: -amount,
      note: "Withdrawal approved",
      createdAt: serverTimestamp()
    });
    showToast("Withdrawal approved!", "success");
    loadAdminWithdraws();
    loadAdminStats();
  } catch(e) { showToast("Error", "error"); }
};

window.rejectRequest = async function(col, docId) {
  await updateDoc(doc(db, col, docId), { status: "rejected" });
  showToast("Rejected", "error");
  if (col === "deposits") loadAdminDeposits();
  else loadAdminWithdraws();
};

async function loadAdminUsers() {
  const list = document.getElementById("usersList");
  list.innerHTML = "";
  const snap = await getDocs(collection(db, "users"));
  snap.forEach(d => {
    const u = d.data();
    if (u.role === "admin") return;
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <div class="admin-card-row">
        <div class="admin-card-info">
          <strong>${u.email}</strong>
          <p>Balance: Rs ${u.balance || 0}</p>
          <p>Ref: ${u.referralCode}</p>
          <p>Joined: ${formatDate(u.createdAt)}</p>
        </div>
        <span class="badge ${u.blocked ? 'badge-rejected' : 'badge-approved'}">${u.blocked ? 'Blocked' : 'Active'}</span>
      </div>
      <div class="admin-card-actions">
        <button class="btn-block" onclick="toggleBlock('${d.id}', ${u.blocked})">${u.blocked ? 'Unblock' : 'Block'}</button>
      </div>
    `;
    list.appendChild(card);
  });
}

window.toggleBlock = async function(uid, blocked) {
  await updateDoc(doc(db, "users", uid), { blocked: !blocked });
  showToast(blocked ? "User unblocked" : "User blocked", blocked ? "success" : "error");
  loadAdminUsers();
};

async function loadAdminPlans() {
  const list = document.getElementById("plansList2");
  list.innerHTML = "";
  const snap = await getDocs(collection(db, "plans"));
  if (snap.empty) {
    list.innerHTML = `<div class="empty-state"><i class="fa fa-chart-line"></i><p>No plans yet</p></div>`;
    return;
  }
  snap.forEach(d => {
    const p = d.data();
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <div class="admin-card-row">
        <div class="admin-card-info">
          <strong>${p.name}</strong>
          <p>Investment: Rs ${p.amount}</p>
          <p>Daily Profit: Rs ${p.dailyProfit}</p>
          <p>Duration: ${p.days} days</p>
        </div>
        <button class="btn-reject" onclick="deletePlan('${d.id}')">Delete</button>
      </div>
    `;
    list.appendChild(card);
  });
}

window.addPlan = async function() {
  const name = document.getElementById("planName").value.trim();
  const amount = Number(document.getElementById("planAmount").value);
  const dailyProfit = Number(document.getElementById("planProfit").value);
  const days = Number(document.getElementById("planDays").value);

  if (!name || !amount || !dailyProfit || !days) return showToast("Fill all plan fields", "error");

  try {
    await addDoc(collection(db, "plans"), { name, amount, dailyProfit, days, createdAt: serverTimestamp() });
    showToast("Plan added!", "success");
    document.getElementById("planName").value = "";
    document.getElementById("planAmount").value = "";
    document.getElementById("planProfit").value = "";
    document.getElementById("planDays").value = "";
    loadAdminPlans();
  } catch(e) { showToast("Error adding plan", "error"); }
};

window.deletePlan = async function(planId) {
  const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  await deleteDoc(doc(db, "plans", planId));
  showToast("Plan deleted", "error");
  loadAdminPlans();
};
