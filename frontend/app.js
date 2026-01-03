// ============================================
// GLOBAL VARIABLES
// ============================================
let web3;
let contract;
let account;
let currentUserRole = null;

const connectBtn = document.getElementById("connectBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

// ============================================
// WALLET CONNECTION (Existing Code)
// ============================================
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

  document.getElementById("wallet").innerText = "Connected: " + account;

  contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

  window.contract = contract;
  window.account = account;

  document.getElementById("connectBtn").style.display = "none";
  logoutBtn.style.display = "inline";

  checkRegistration();
}

// ============================================
// REGISTRATION CHECK (Existing Code)
// ============================================
async function checkRegistration() {
  const user = await contract.methods.users(account).call();

  if (user.registered) {
    currentUserRole = parseInt(user.role);
    showRoleBasedDashboard(user);
  } else {
    document.getElementById("registration").style.display = "block";
  }
}

// ============================================
// USER REGISTRATION (Existing Code)
// ============================================
registerBtn.onclick = registerUser;

async function registerUser() {
  const role = document.getElementById("role").value;
  const name = document.getElementById("name").value;

  if (!role || !name) {
    alert("Role and name required");
    return;
  }

  try {
    if (role === "client") {
      await contract.methods.registerClient(name).send({ from: account });
    }

    if (role === "freelancer") {
      await contract.methods.registerFreelancer(name).send({ from: account });
    }

    alert("Registered successfully!");
    location.reload();
  } catch (error) {
    console.error(error);
    alert("Registration failed: " + error.message);
  }
}

// ============================================
// ROLE-BASED DASHBOARD DISPLAY
// ============================================
function showRoleBasedDashboard(user) {
  document.getElementById("registration").style.display = "none";
  document.getElementById("homepage").style.display = "block";

  let roleText = "Unknown";
  if (user.role == 0) roleText = "Arbiter";
  if (user.role == 1) roleText = "Client";
  if (user.role == 2) roleText = "Freelancer";

  document.getElementById("userInfo").innerText =
    `Name: ${user.name}\nRole: ${roleText}\nReputation: ${user.reputation}`;

  // Show role-specific dashboard
  if (user.role == 0) {
    // Arbiter
    document.getElementById("arbiterDashboard").style.display = "block";
    loadArbiterDashboard();
  } else if (user.role == 1) {
    // Client
    document.getElementById("clientDashboard").style.display = "block";
    loadClientDashboard();
  } else if (user.role == 2) {
    // Freelancer
    document.getElementById("freelancerDashboard").style.display = "block";
    loadFreelancerDashboard();
  }

  // Start listening to events for auto-refresh
  setupEventListeners();
}

// ============================================
// LOGOUT (Existing Code)
// ============================================
logoutBtn.onclick = logout;

function resetUI() {
  document.getElementById("registration").style.display = "none";
  document.getElementById("homepage").style.display = "none";
  document.getElementById("clientDashboard").style.display = "none";
  document.getElementById("freelancerDashboard").style.display = "none";
  document.getElementById("arbiterDashboard").style.display = "none";
  document.getElementById("wallet").innerText = "";

  account = null;
  contract = null;
  currentUserRole = null;
}

function logout() {
  resetUI();
  document.getElementById("connectBtn").style.display = "inline";
  logoutBtn.style.display = "none";
  alert("Logged out. You can switch accounts and reconnect.");
}

// ============================================
// CLIENT DASHBOARD
// ============================================
async function loadClientDashboard() {
  // Post Job Button
  document.getElementById("postJobBtn").onclick = postJob;

  // Load client's posted jobs
  await loadClientJobs();
}

// Post a new job
async function postJob() {
  const title = document.getElementById("jobTitle").value;
  const category = document.getElementById("jobCategory").value;
  const budget = document.getElementById("jobBudget").value;
  const deadlineInput = document.getElementById("jobDeadline").value;

  if (!title || !category || !budget || !deadlineInput) {
    alert("All fields are required");
    return;
  }

  // Convert datetime-local to Unix timestamp
  const deadline = Math.floor(new Date(deadlineInput).getTime() / 1000);
  const budgetWei = web3.utils.toWei(budget, "ether");

  try {
    await contract.methods
      .postJob(title, category, budgetWei, deadline)
      .send({ from: account });

    alert("Job posted successfully!");
    
    // Clear form
    document.getElementById("jobTitle").value = "";
    document.getElementById("jobCategory").value = "";
    document.getElementById("jobBudget").value = "";
    document.getElementById("jobDeadline").value = "";

    // Reload jobs
    await loadClientJobs();
  } catch (error) {
    console.error(error);
    alert("Failed to post job: " + error.message);
  }
}

// Load all jobs posted by this client
async function loadClientJobs() {
  const jobCount = await contract.methods.jobCount().call();
  const jobsList = document.getElementById("clientJobsList");
  jobsList.innerHTML = "";

  if (jobCount == 0) {
    jobsList.innerHTML = '<p class="empty-state">No jobs posted yet</p>';
    return;
  }

  for (let i = 1; i <= jobCount; i++) {
    const job = await contract.methods.jobs(i).call();

    // Only show jobs posted by this client
    if (job.client.toLowerCase() !== account.toLowerCase()) continue;

    const jobCard = createClientJobCard(job);
    jobsList.appendChild(jobCard);
  }
}

// Create job card for client view
function createClientJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";

  const statusText = getStatusText(job.status);
  const budgetEth = web3.utils.fromWei(job.maxBudget, "ether");
  const deadlineDate = new Date(job.deadline * 1000).toLocaleString();

  let escrowBadge = "";
  if (job.status == 1 && job.agreedAmount > 0) {
    // InProgress with funds in escrow
    escrowBadge = '<span class="escrow-badge">Funds in Escrow</span>';
  }

  card.innerHTML = `
    <h4>${job.title}</h4>
    <p><strong>Category:</strong> ${job.category}</p>
    <p><strong>Budget:</strong> ${budgetEth} ETH</p>
    <p><strong>Deadline:</strong> ${deadlineDate}</p>
    <p><span class="job-status status-${statusText.toLowerCase()}">${statusText}</span>${escrowBadge}</p>
  `;

  // Add action buttons based on status
  if (job.status == 0) {
    // Open - View Bids
    const viewBidsBtn = document.createElement("button");
    viewBidsBtn.className = "btn btn-primary btn-small";
    viewBidsBtn.innerText = "View Bids";
    viewBidsBtn.onclick = () => viewBids(job.id);
    card.appendChild(viewBidsBtn);
  } else if (job.status == 2) {
    // Completed - Approve or Dispute
    const approveBtn = document.createElement("button");
    approveBtn.className = "btn btn-success btn-small";
    approveBtn.innerText = "Approve Work";
    approveBtn.onclick = () => approveWork(job.id);
    card.appendChild(approveBtn);

    const disputeBtn = document.createElement("button");
    disputeBtn.className = "btn btn-danger btn-small";
    disputeBtn.innerText = "Raise Dispute";
    disputeBtn.onclick = () => raiseDispute(job.id);
    card.appendChild(disputeBtn);
  } else if (job.status == 1) {
    // InProgress
    const freelancerAddr = job.freelancer;
    card.innerHTML += `<p><strong>Freelancer:</strong> ${freelancerAddr}</p>`;
  }

  return card;
}

// View bids for a job
async function viewBids(jobId) {
  const job = await contract.methods.jobs(jobId).call();
  
  document.getElementById("modalJobTitle").innerText = job.title;
  document.getElementById("bidsModal").style.display = "flex";

  const bidsList = document.getElementById("bidsList");
  bidsList.innerHTML = '<p class="loading">Loading bids...</p>';

  // Get all bids for this job
  const bids = [];
  let bidIndex = 0;
  
  try {
    while (true) {
      const bid = await contract.methods.jobBids(jobId, bidIndex).call();
      if (bid.freelancer === "0x0000000000000000000000000000000000000000") break;
      bids.push({ ...bid, index: bidIndex });
      bidIndex++;
    }
  } catch (error) {
    // No more bids
  }

  bidsList.innerHTML = "";

  if (bids.length === 0) {
    bidsList.innerHTML = '<p class="empty-state">No bids yet</p>';
    return;
  }

  for (const bid of bids) {
    const bidCard = document.createElement("div");
    bidCard.className = "bid-card";

    const amountEth = web3.utils.fromWei(bid.amount, "ether");

    bidCard.innerHTML = `
      <p><strong>Freelancer:</strong> ${bid.freelancer}</p>
      <p><strong>Bid Amount:</strong> ${amountEth} ETH</p>
      <p><strong>Time Required:</strong> ${bid.timeRequired} days</p>
    `;

    // Add Hire button
    const hireBtn = document.createElement("button");
    hireBtn.className = "btn btn-success btn-small";
    hireBtn.innerText = "Hire";
    hireBtn.onclick = () => hireFreelancer(jobId, bid.index, bid.amount);
    bidCard.appendChild(hireBtn);

    bidsList.appendChild(bidCard);
  }
}

// Close bids modal
document.getElementById("closeBidsModal").onclick = () => {
  document.getElementById("bidsModal").style.display = "none";
};

// Hire freelancer - Trigger MetaMask payment
async function hireFreelancer(jobId, bidIndex, bidAmount) {
  try {
    await contract.methods
      .hireFreelancer(jobId, bidIndex)
      .send({
        from: account,
        value: bidAmount // Send exact bid amount as payment
      });

    alert("Freelancer hired successfully! Funds are now in escrow.");
    document.getElementById("bidsModal").style.display = "none";
    await loadClientJobs();
  } catch (error) {
    console.error(error);
    alert("Failed to hire freelancer: " + error.message);
  }
}

// Approve work
async function approveWork(jobId) {
  if (!confirm("Are you sure you want to approve this work? Payment will be released.")) {
    return;
  }

  try {
    await contract.methods.approveWork(jobId).send({ from: account });
    alert("Work approved! Payment released to freelancer.");
    await loadClientJobs();
  } catch (error) {
    console.error(error);
    alert("Failed to approve work: " + error.message);
  }
}

// Raise dispute
async function raiseDispute(jobId) {
  if (!confirm("Are you sure you want to raise a dispute? An arbiter will review this.")) {
    return;
  }

  try {
    await contract.methods.raiseDispute(jobId).send({ from: account });
    alert("Dispute raised. An arbiter will review this case.");
    await loadClientJobs();
  } catch (error) {
    console.error(error);
    alert("Failed to raise dispute: " + error.message);
  }
}

// ============================================
// FREELANCER DASHBOARD
// ============================================
async function loadFreelancerDashboard() {
  // Load job marketplace
  await loadJobMarketplace();

  // Load freelancer's hired jobs
  await loadFreelancerJobs();

  // Category filter
  document.getElementById("categoryFilter").onchange = loadJobMarketplace;
}

// Load and display job marketplace with filtering and sorting
async function loadJobMarketplace() {
  const jobCount = await contract.methods.jobCount().call();
  const marketplace = document.getElementById("jobMarketplace");
  marketplace.innerHTML = '<p class="loading">Loading jobs...</p>';

  const selectedCategory = document.getElementById("categoryFilter").value;

  if (jobCount == 0) {
    marketplace.innerHTML = '<p class="empty-state">No jobs available</p>';
    return;
  }

  // Fetch all open jobs
  const openJobs = [];
  for (let i = 1; i <= jobCount; i++) {
    const job = await contract.methods.jobs(i).call();
    
    // Only show Open status jobs
    if (job.status == 0) {
      openJobs.push(job);
    }
  }

  // Filter by category
  let filteredJobs = openJobs;
  if (selectedCategory !== "all") {
    filteredJobs = openJobs.filter(job => job.category === selectedCategory);
  }

  // Sort by highest budget first
  filteredJobs.sort((a, b) => {
    return parseFloat(b.maxBudget) - parseFloat(a.maxBudget);
  });

  marketplace.innerHTML = "";

  if (filteredJobs.length === 0) {
    marketplace.innerHTML = '<p class="empty-state">No jobs found for selected category</p>';
    return;
  }

  for (const job of filteredJobs) {
    const jobCard = createFreelancerJobCard(job);
    marketplace.appendChild(jobCard);
  }
}

// Create job card for freelancer view
function createFreelancerJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";

  const budgetEth = web3.utils.fromWei(job.maxBudget, "ether");
  const deadlineDate = new Date(job.deadline * 1000).toLocaleString();

  card.innerHTML = `
    <h4>${job.title}</h4>
    <p><strong>Category:</strong> ${job.category}</p>
    <p><strong>Budget:</strong> ${budgetEth} ETH</p>
    <p><strong>Deadline:</strong> ${deadlineDate}</p>
    <p><strong>Client:</strong> ${job.client}</p>
  `;

  // Add Place Bid button
  const bidBtn = document.createElement("button");
  bidBtn.className = "btn btn-primary btn-small";
  bidBtn.innerText = "Place Bid";
  bidBtn.onclick = () => openBidModal(job);
  card.appendChild(bidBtn);

  return card;
}

// Open bid modal
async function openBidModal(job) {
  // Check freelancer reputation
  const user = await contract.methods.users(account).call();
  if (parseInt(user.reputation) < 50) {
    alert("Your reputation is too low to place bids (minimum 50 required)");
    return;
  }

  document.getElementById("bidModalJobTitle").innerText = job.title;
  document.getElementById("bidModalMaxBudget").innerText = web3.utils.fromWei(job.maxBudget, "ether");
  document.getElementById("bidModal").style.display = "flex";

  // Store job data for validation
  window.currentBidJob = job;

  // Clear previous inputs
  document.getElementById("bidAmount").value = "";
  document.getElementById("bidTime").value = "";
  document.getElementById("bidError").innerText = "";

  // Set up place bid button
  document.getElementById("placeBidBtn").onclick = placeBid;
}

// Close bid modal
document.getElementById("closeBidModal").onclick = () => {
  document.getElementById("bidModal").style.display = "none";
};

// Place bid with validation
async function placeBid() {
  const bidAmount = document.getElementById("bidAmount").value;
  const bidTime = document.getElementById("bidTime").value;
  const errorMsg = document.getElementById("bidError");

  errorMsg.innerText = "";

  if (!bidAmount || !bidTime) {
    errorMsg.innerText = "All fields are required";
    return;
  }

  const bidAmountWei = web3.utils.toWei(bidAmount, "ether");
  const maxBudget = window.currentBidJob.maxBudget;

  // Validation: Bid amount cannot exceed max budget
  if (parseFloat(bidAmountWei) > parseFloat(maxBudget)) {
    errorMsg.innerText = "Bid amount exceeds job budget!";
    return;
  }

  try {
    await contract.methods
      .placeBid(window.currentBidJob.id, bidAmountWei, bidTime)
      .send({ from: account });

    alert("Bid placed successfully!");
    document.getElementById("bidModal").style.display = "none";
    await loadJobMarketplace();
  } catch (error) {
    console.error(error);
    errorMsg.innerText = "Failed to place bid: " + error.message;
  }
}

// Load jobs where freelancer is hired
async function loadFreelancerJobs() {
  const jobCount = await contract.methods.jobCount().call();
  const myJobsList = document.getElementById("freelancerMyJobs");
  myJobsList.innerHTML = "";

  const myJobs = [];

  for (let i = 1; i <= jobCount; i++) {
    const job = await contract.methods.jobs(i).call();
    
    // Only show jobs where this freelancer is hired
    if (job.freelancer.toLowerCase() === account.toLowerCase()) {
      myJobs.push(job);
    }
  }

  if (myJobs.length === 0) {
    myJobsList.innerHTML = '<p class="empty-state">No active jobs</p>';
    return;
  }

  for (const job of myJobs) {
    const jobCard = createFreelancerMyJobCard(job);
    myJobsList.appendChild(jobCard);
  }
}

// Create job card for freelancer's hired jobs
function createFreelancerMyJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";

  const statusText = getStatusText(job.status);
  const agreedAmountEth = web3.utils.fromWei(job.agreedAmount, "ether");

  card.innerHTML = `
    <h4>${job.title}</h4>
    <p><strong>Category:</strong> ${job.category}</p>
    <p><strong>Agreed Amount:</strong> ${agreedAmountEth} ETH</p>
    <p><strong>Client:</strong> ${job.client}</p>
    <p><span class="job-status status-${statusText.toLowerCase()}">${statusText}</span></p>
  `;

  // Add Submit Work button if job is InProgress
  if (job.status == 1) {
    const submitBtn = document.createElement("button");
    submitBtn.className = "btn btn-success btn-small";
    submitBtn.innerText = "Submit Work";
    submitBtn.onclick = () => submitWork(job.id);
    card.appendChild(submitBtn);
  }

  return card;
}

// Submit work
async function submitWork(jobId) {
  if (!confirm("Are you sure you want to mark this work as completed?")) {
    return;
  }

  try {
    await contract.methods.markWorkCompleted(jobId).send({ from: account });
    alert("Work submitted! Waiting for client approval.");
    await loadFreelancerJobs();
  } catch (error) {
    console.error(error);
    alert("Failed to submit work: " + error.message);
  }
}

// ============================================
// ARBITER DASHBOARD
// ============================================
async function loadArbiterDashboard() {
  // Load platform fees
  await loadPlatformFees();

  // Load disputed jobs
  await loadDisputedJobs();

  // Withdraw fees button
  document.getElementById("withdrawFeesBtn").onclick = withdrawFees;
}

// Load and display total platform fees
async function loadPlatformFees() {
  const fees = await contract.methods.collectedFees().call();
  const feesEth = web3.utils.fromWei(fees, "ether");
  document.getElementById("totalFees").innerText = feesEth;
}

// Withdraw platform fees
async function withdrawFees() {
  const address = document.getElementById("withdrawAddress").value;
  const amount = document.getElementById("withdrawAmount").value;

  if (!address || !amount) {
    alert("Address and amount are required");
    return;
  }

  const amountWei = web3.utils.toWei(amount, "ether");

  try {
    await contract.methods.withdrawFees(address, amountWei).send({ from: account });
    alert("Fees withdrawn successfully!");
    
    // Clear form
    document.getElementById("withdrawAddress").value = "";
    document.getElementById("withdrawAmount").value = "";
    
    await loadPlatformFees();
  } catch (error) {
    console.error(error);
    alert("Failed to withdraw fees: " + error.message);
  }
}

// Load disputed jobs
async function loadDisputedJobs() {
  const jobCount = await contract.methods.jobCount().call();
  const disputedList = document.getElementById("disputedJobsList");
  disputedList.innerHTML = "";

  const disputedJobs = [];

  for (let i = 1; i <= jobCount; i++) {
    const job = await contract.methods.jobs(i).call();
    
    // Only show jobs with Disputed status (status = 4)
    if (job.status == 4) {
      disputedJobs.push(job);
    }
  }

  if (disputedJobs.length === 0) {
    disputedList.innerHTML = '<p class="empty-state">No disputed jobs</p>';
    return;
  }

  for (const job of disputedJobs) {
    const jobCard = createDisputedJobCard(job);
    disputedList.appendChild(jobCard);
  }
}

// Create disputed job card
function createDisputedJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";

  const agreedAmountEth = web3.utils.fromWei(job.agreedAmount, "ether");

  card.innerHTML = `
    <h4>${job.title}</h4>
    <p><strong>Category:</strong> ${job.category}</p>
    <p><strong>Agreed Amount:</strong> ${agreedAmountEth} ETH</p>
    <p><strong>Client:</strong> ${job.client}</p>
    <p><strong>Freelancer:</strong> ${job.freelancer}</p>
    <p><span class="job-status status-disputed">Disputed</span></p>
  `;

  // Add resolution buttons
  const refundBtn = document.createElement("button");
  refundBtn.className = "btn btn-danger btn-small";
  refundBtn.innerText = "Refund Client";
  refundBtn.onclick = () => resolveDispute(job.id, false);
  card.appendChild(refundBtn);

  const payBtn = document.createElement("button");
  payBtn.className = "btn btn-success btn-small";
  payBtn.innerText = "Pay Freelancer";
  payBtn.onclick = () => resolveDispute(job.id, true);
  card.appendChild(payBtn);

  return card;
}

// Resolve dispute
async function resolveDispute(jobId, payFreelancer) {
  const action = payFreelancer ? "pay the freelancer" : "refund the client";
  
  if (!confirm(`Are you sure you want to ${action}?`)) {
    return;
  }

  try {
    await contract.methods.resolveDispute(jobId, payFreelancer).send({ from: account });
    alert("Dispute resolved successfully!");
    await loadDisputedJobs();
    await loadPlatformFees();
  } catch (error) {
    console.error(error);
    alert("Failed to resolve dispute: " + error.message);
  }
}

// ============================================
// EVENT LISTENERS FOR AUTO-REFRESH
// ============================================
function setupEventListeners() {
  // Listen to JobPosted event
  contract.events.JobPosted({})
    .on('data', async (event) => {
      console.log('Job Posted:', event.returnValues);
      if (currentUserRole === 1) {
        await loadClientJobs();
      } else if (currentUserRole === 2) {
        await loadJobMarketplace();
      }
    });

  // Listen to BidPlaced event
  contract.events.BidPlaced({})
    .on('data', async (event) => {
      console.log('Bid Placed:', event.returnValues);
      if (currentUserRole === 1) {
        await loadClientJobs();
      }
    });

  // Listen to FreelancerHired event
  contract.events.FreelancerHired({})
    .on('data', async (event) => {
      console.log('Freelancer Hired:', event.returnValues);
      if (currentUserRole === 1) {
        await loadClientJobs();
      } else if (currentUserRole === 2) {
        await loadJobMarketplace();
        await loadFreelancerJobs();
      }
    });

  // Listen to WorkMarkedCompleted event
  contract.events.WorkMarkedCompleted({})
    .on('data', async (event) => {
      console.log('Work Marked Completed:', event.returnValues);
      if (currentUserRole === 1) {
        await loadClientJobs();
      } else if (currentUserRole === 2) {
        await loadFreelancerJobs();
      }
    });

  // Listen to WorkApproved event
  contract.events.WorkApproved({})
    .on('data', async (event) => {
      console.log('Work Approved:', event.returnValues);
      if (currentUserRole === 1) {
        await loadClientJobs();
      } else if (currentUserRole === 2) {
        await loadFreelancerJobs();
      }
    });

  // Listen to DisputeRaised event
  contract.events.DisputeRaised({})
    .on('data', async (event) => {
      console.log('Dispute Raised:', event.returnValues);
      if (currentUserRole === 0) {
        await loadDisputedJobs();
      } else if (currentUserRole === 1) {
        await loadClientJobs();
      }
    });

  // Listen to DisputeResolved event
  contract.events.DisputeResolved({})
    .on('data', async (event) => {
      console.log('Dispute Resolved:', event.returnValues);
      if (currentUserRole === 0) {
        await loadDisputedJobs();
        await loadPlatformFees();
      } else if (currentUserRole === 1) {
        await loadClientJobs();
      } else if (currentUserRole === 2) {
        await loadFreelancerJobs();
      }
    });

  console.log('Event listeners setup complete');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getStatusText(status) {
  const statuses = ["Open", "InProgress", "Completed", "Closed", "Disputed", "Resolved"];
  return statuses[status] || "Unknown";
}