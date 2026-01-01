let web3;
let contract;
let account;

const connectBtn = document.getElementById("connectBtn");
const registerBtn = document.getElementById("registerBtn");


// CONNECTING WALLET
connectBtn.onclick = connectWallet;

async function connectWallet() {
  resetUI();

  if (!window.ethereum) {
    alert("MetaMask not found");
    return;
  }

  web3 = new Web3(window.ethereum);
  await window.ethereum.request({ method: "eth_requestAccounts" });

  const accounts = await web3.eth.getAccounts();
  account = accounts[0];

  document.getElementById("wallet").innerText =
    "Connected: " + account;

  contract = new web3.eth.Contract(
    CONTRACT_ABI,
    CONTRACT_ADDRESS
  );

  window.contract = contract;
  window.account = account;

  document.getElementById("connectBtn").style.display = "none";
  logoutBtn.style.display = "inline";
  
  checkRegistration();
}


// CHECK REGISTRATION
async function checkRegistration() {
  const user = await contract.methods.users(account).call();

  if (user.registered) {
    showHomepage(user);
  } else {
    document.getElementById("registration").style.display = "block";
  }
}

// USER REGISTRATION
registerBtn.onclick = registerUser;

async function registerUser() {
  const role = document.getElementById("role").value;
  const name = document.getElementById("name").value;

  if (!role || !name) {
    alert("Role and name required");
    return;
  }

  if (role === "client") {
    await contract.methods
      .registerClient(name)
      .send({ from: account });
  }

  if (role === "freelancer") {
    await contract.methods
      .registerFreelancer(name)
      .send({ from: account });
  }

  alert("Registered successfully!");
  location.reload();
}

// HOMEPAGE
function showHomepage(user) {
  resetClientSection();
  
  document.getElementById("registration").style.display = "none";
  document.getElementById("homepage").style.display = "block";

  let roleText = "Unknown";
  if (user.role == 0) roleText = "Arbiter";
  if (user.role == 1) roleText = "Client";
  if (user.role == 2) roleText = "Freelancer";

  document.getElementById("userInfo").innerText =
    `Name: ${user.name}
Role: ${roleText}
Reputation: ${user.reputation}`;

  // Client-only UI
  if (user.role == 1) {
    document.getElementById("clientSection").style.display = "block";
    loadClientJobs();
  }
}

// RESET JOB FORM (soft refreshing to apply logout logic)
function resetJobForm() {
  document.getElementById("jobTitle").value = "";
  document.getElementById("jobCategory").value = "";
  document.getElementById("jobBudget").value = "";
  document.getElementById("jobDeadline").value = "";
}

function resetClientSection() {
  document.getElementById("clientSection").style.display = "none";
  document.getElementById("jobList").innerHTML = "";
  resetJobForm();
}


// CLEAR JOB LIST
function clearClientUI() {
  const section = document.getElementById("clientSection");
  section.innerHTML = "";
}

// JOB POSTING (CLIENT)
document.getElementById("postJobBtn").onclick = postJob;

async function postJob() {
  const btn = document.getElementById("postJobBtn");
  btn.disabled = true;

  try {
    const title = document.getElementById("jobTitle").value;
    const category = document.getElementById("jobCategory").value;
    const budget = document.getElementById("jobBudget").value;
    const deadline = document.getElementById("jobDeadline").value;
  
    if (!title || !category || !budget || !deadline) {
      alert("All fields required");
      return;
    }
  
    await contract.methods
      .postJob(title, category, budget, deadline)
      .send({ from: account });
  
    alert("Job posted!");
    resetJobForm();
    loadClientJobs();
  } finally {
    btn.disabled = false;
  }
}


// LOADing CLIENT JOBS
async function loadClientJobs() {
  const jobList = document.getElementById("jobList");
  jobList.innerHTML = "";

  const count = await contract.methods.jobCount().call();

  for (let i = 1; i <= count; i++) {
    const job = await contract.methods.jobs(i).call();

    if (job.client.toLowerCase() === account.toLowerCase()) {
      const li = document.createElement("li");
      li.innerText = `#${job.id}: ${job.title} | Budget: ${job.maxBudget}`;
      jobList.appendChild(li);
    }
  }
}


// LOGOUT
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.onclick = logout;

function resetUI() {
  document.getElementById("registration").style.display = "none";
  document.getElementById("homepage").style.display = "none";
  document.getElementById("wallet").innerText = "";

  resetClientSection(); 

  account = null;
  contract = null;
}

function logout() {
  resetUI();

  document.getElementById("connectBtn").style.display = "inline";
  logoutBtn.style.display = "none";

  alert("Logged out. You can switch accounts and reconnect.");
}
