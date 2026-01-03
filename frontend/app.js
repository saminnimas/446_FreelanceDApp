let web3;
let contract;
let account;
let currentUserRole = null;

let eventsInitialized = false;

// Debounce timers to prevent rapid-fire event refreshes
let refreshTimeouts = {
  clientJobs: null,
  jobMarketplace: null,
  freelancerJobs: null,
  disputedJobs: null,
  platformFees: null
};

// Track if refresh is currently in progress
let refreshInProgress = {
  clientJobs: false,
  jobMarketplace: false,
  freelancerJobs: false,
  disputedJobs: false,
  platformFees: false
};

// Store event subscriptions for cleanup
let eventSubscriptions = [];

// Pagination tracking
let paginationState = {
  clientJobs: { currentPage: 1, itemsPerPage: 8, totalItems: 0 },
  jobMarketplace: { currentPage: 1, itemsPerPage: 8, totalItems: 0 },
  freelancerJobs: { currentPage: 1, itemsPerPage: 8, totalItems: 0 },
  disputedJobs: { currentPage: 1, itemsPerPage: 8, totalItems: 0 }
};

const connectBtn = document.getElementById("connectBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");


// WALLET CONNECTION
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

// REGISTRATION CHECK
async function checkRegistration() {
  const user = await contract.methods.users(account).call();

  if (user.registered) {
    currentUserRole = parseInt(user.role);
    showRoleBasedDashboard(user);
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

// ROLE-BASED DASHBOARD DISPLAY
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

// LOGOUT (Existing Code)
logoutBtn.onclick = logout;

function resetUI() {
  document.getElementById("registration").style.display = "none";
  document.getElementById("homepage").style.display = "none";
  document.getElementById("clientDashboard").style.display = "none";
  document.getElementById("freelancerDashboard").style.display = "none";
  document.getElementById("arbiterDashboard").style.display = "none";
  document.getElementById("wallet").innerText = "";

  // Clean up event listeners
  cleanupEventListeners();

  account = null;
  contract = null;
  currentUserRole = null;
  eventsInitialized = false;
}

function logout() {
  resetUI();
  document.getElementById("connectBtn").style.display = "inline";
  logoutBtn.style.display = "none";
  alert("Logged out. You can switch accounts and reconnect.");
}

// CLIENT DASHBOARD
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
  // Prevent simultaneous refreshes
  if (refreshInProgress.clientJobs) {
    console.log('Client jobs refresh already in progress, skipping...');
    return;
  }

  refreshInProgress.clientJobs = true;

  try {
    const jobCount = await contract.methods.jobCount().call();
    const jobsList = document.getElementById("clientJobsList");
    jobsList.innerHTML = "";

    if (jobCount == 0) {
      jobsList.innerHTML = '<p class="empty-state">No jobs posted yet</p>';
      return;
    }

    // Collect all jobs for this client
    const clientJobsData = [];
    for (let i = 1; i <= jobCount; i++) {
      const job = await contract.methods.jobs(i).call();
      if (job.client.toLowerCase() === account.toLowerCase()) {
        clientJobsData.push({ ...job, id: i });
      }
    }

    // Update pagination state
    paginationState.clientJobs.totalItems = clientJobsData.length;
    paginationState.clientJobs.currentPage = 1;

    // Render the table with pagination
    renderClientJobsTable(clientJobsData, jobsList);
  } finally {
    refreshInProgress.clientJobs = false;
  }
}

// Render client jobs table with pagination
function renderClientJobsTable(allJobs, container) {
  const state = paginationState.clientJobs;
  const start = (state.currentPage - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const paginatedJobs = allJobs.slice(start, end);

  let html = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Category</th>
            <th>Budget (ETH)</th>
            <th>Deadline</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  paginatedJobs.forEach(job => {
    const statusText = getStatusText(job.status);
    const budgetEth = web3.utils.fromWei(job.maxBudget, "ether");
    const deadlineDate = new Date(job.deadline * 1000).toLocaleDateString();

    let escrowBadge = "";
    if (job.status == 1 && job.agreedAmount > 0) {
      escrowBadge = ' <span class="escrow-badge">In Escrow</span>';
    }

    let actionBtn = "";
    if (job.status == 0) {
      actionBtn = `<button class="btn btn-primary btn-small" onclick="viewBids(${job.id})">View Bids</button>`;
    } else if (job.status == 2) {
      actionBtn = `
        <button class="btn btn-success btn-small" onclick="approveWork(${job.id})">Approve</button>
        <button class="btn btn-danger btn-small" onclick="raiseDispute(${job.id})">Dispute</button>
      `;
    }

    html += `
      <tr>
        <td><strong>${job.title}</strong></td>
        <td>${job.category}</td>
        <td>${budgetEth}</td>
        <td>${deadlineDate}</td>
        <td><span class="status-badge status-${statusText.toLowerCase()}">${statusText}</span>${escrowBadge}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  // Add pagination controls
  const totalPages = Math.ceil(state.totalItems / state.itemsPerPage);
  if (totalPages > 1) {
    html += createPaginationControls('clientJobs', state.currentPage, totalPages, 'loadClientJobs');
  }

  container.innerHTML = html;
}

// Pagination helper function
function createPaginationControls(paginationKey, currentPage, totalPages, reloadFunction) {
  let html = '<div class="pagination-container">';

  // Previous button
  html += `<button class="pagination-btn" onclick="goToPage('${paginationKey}', ${currentPage - 1}, '${reloadFunction}')" ${currentPage === 1 ? 'disabled' : ''}>← Previous</button>`;

  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    const isActive = i === currentPage ? 'active' : '';
    html += `<button class="pagination-btn ${isActive}" onclick="goToPage('${paginationKey}', ${i}, '${reloadFunction}')">${i}</button>`;
  }

  // Next button
  html += `<button class="pagination-btn" onclick="goToPage('${paginationKey}', ${currentPage + 1}, '${reloadFunction}')" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button>`;

  // Page info
  html += `<span class="pagination-info">Page ${currentPage} of ${totalPages}</span>`;

  html += '</div>';
  return html;
}

// Go to specific page
function goToPage(paginationKey, pageNum, reloadFunction) {
  paginationState[paginationKey].currentPage = pageNum;
  window[reloadFunction]();
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
  document.getElementById("bidsModal").classList.add("show");

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

  let html = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Freelancer</th>
            <th>Bid Amount (ETH)</th>
            <th>Time Required (days)</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  bids.forEach(bid => {
    const amountEth = web3.utils.fromWei(bid.amount, "ether");
    const shortFreelancer = bid.freelancer.substring(0, 10) + "...";

    html += `
      <tr>
        <td title="${bid.freelancer}">${shortFreelancer}</td>
        <td><strong>${amountEth}</strong></td>
        <td>${bid.timeRequired}</td>
        <td><button class="btn btn-success btn-small" onclick="hireFreelancer(${jobId}, ${bid.index}, '${bid.amount}')">Hire</button></td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  bidsList.innerHTML = html;
}

// Close bids modal
document.getElementById("closeBidsModal").onclick = () => {
  document.getElementById("bidsModal").classList.remove("show");
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
    document.getElementById("bidsModal").classList.remove("show");
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

// FREELANCER DASHBOARD

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
  // Prevent simultaneous refreshes
  if (refreshInProgress.jobMarketplace) {
    console.log('Job marketplace refresh already in progress, skipping...');
    return;
  }

  refreshInProgress.jobMarketplace = true;

  try {
    const jobCount = await contract.methods.jobCount().call();
    const marketplace = document.getElementById("jobMarketplace");
    marketplace.innerHTML = '';

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
        openJobs.push({ ...job, id: i });
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

    // Update pagination state
    paginationState.jobMarketplace.totalItems = filteredJobs.length;
    paginationState.jobMarketplace.currentPage = 1;

    if (filteredJobs.length === 0) {
      marketplace.innerHTML = '<p class="empty-state">No jobs found for selected category</p>';
      return;
    }

    // Render the table with pagination
    renderJobMarketplaceTable(filteredJobs, marketplace);
  } finally {
    refreshInProgress.jobMarketplace = false;
  }
}

// Render job marketplace table with pagination
function renderJobMarketplaceTable(allJobs, container) {
  const state = paginationState.jobMarketplace;
  const start = (state.currentPage - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const paginatedJobs = allJobs.slice(start, end);

  let html = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Category</th>
            <th>Budget (ETH)</th>
            <th>Deadline</th>
            <th>Client</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  paginatedJobs.forEach(job => {
    const budgetEth = web3.utils.fromWei(job.maxBudget, "ether");
    const deadlineDate = new Date(job.deadline * 1000).toLocaleDateString();
    const shortClient = job.client.substring(0, 10) + "...";

    html += `
      <tr>
        <td><strong>${job.title}</strong></td>
        <td>${job.category}</td>
        <td>${budgetEth}</td>
        <td>${deadlineDate}</td>
        <td title="${job.client}">${shortClient}</td>
        <td><button class="btn btn-primary btn-small" onclick="openBidModal(${JSON.stringify(job).replace(/"/g, '&quot;')})">Place Bid</button></td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  // Add pagination controls
  const totalPages = Math.ceil(state.totalItems / state.itemsPerPage);
  if (totalPages > 1) {
    html += createPaginationControls('jobMarketplace', state.currentPage, totalPages, 'loadJobMarketplace');
  }

  container.innerHTML = html;
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
  document.getElementById("bidModal").classList.add("show");

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
  document.getElementById("bidModal").classList.remove("show");
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
  // Prevent simultaneous refreshes
  if (refreshInProgress.freelancerJobs) {
    console.log('Freelancer jobs refresh already in progress, skipping...');
    return;
  }

  refreshInProgress.freelancerJobs = true;

  try {
    const jobCount = await contract.methods.jobCount().call();
    const myJobsList = document.getElementById("freelancerMyJobs");
    myJobsList.innerHTML = "";

    const myJobs = [];

    for (let i = 1; i <= jobCount; i++) {
      const job = await contract.methods.jobs(i).call();
      
      // Only show jobs where this freelancer is hired
      if (job.freelancer.toLowerCase() === account.toLowerCase()) {
        myJobs.push({ ...job, id: i });
      }
    }

    // Update pagination state
    paginationState.freelancerJobs.totalItems = myJobs.length;
    paginationState.freelancerJobs.currentPage = 1;

    if (myJobs.length === 0) {
      myJobsList.innerHTML = '<p class="empty-state">No active jobs</p>';
      return;
    }

    // Render the table with pagination
    renderFreelancerJobsTable(myJobs, myJobsList);
  } finally {
    refreshInProgress.freelancerJobs = false;
  }
}

// Render freelancer jobs table with pagination
function renderFreelancerJobsTable(allJobs, container) {
  const state = paginationState.freelancerJobs;
  const start = (state.currentPage - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const paginatedJobs = allJobs.slice(start, end);

  let html = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Category</th>
            <th>Agreed Amount (ETH)</th>
            <th>Client</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  paginatedJobs.forEach(job => {
    const statusText = getStatusText(job.status);
    const agreedAmountEth = web3.utils.fromWei(job.agreedAmount, "ether");
    const shortClient = job.client.substring(0, 10) + "...";

    let actionBtn = "";
    if (job.status == 1) {
      actionBtn = `<button class="btn btn-success btn-small" onclick="submitWork(${job.id})">Submit Work</button>`;
    }

    html += `
      <tr>
        <td><strong>${job.title}</strong></td>
        <td>${job.category}</td>
        <td>${agreedAmountEth}</td>
        <td title="${job.client}">${shortClient}</td>
        <td><span class="status-badge status-${statusText.toLowerCase()}">${statusText}</span></td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  // Add pagination controls
  const totalPages = Math.ceil(state.totalItems / state.itemsPerPage);
  if (totalPages > 1) {
    html += createPaginationControls('freelancerJobs', state.currentPage, totalPages, 'loadFreelancerJobs');
  }

  container.innerHTML = html;
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

// ARBITER DASHBOARD
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
  // Prevent simultaneous refreshes
  if (refreshInProgress.platformFees) {
    console.log('Platform fees refresh already in progress, skipping...');
    return;
  }

  refreshInProgress.platformFees = true;

  try {
    const fees = await contract.methods.collectedFees().call();
    const feesEth = web3.utils.fromWei(fees, "ether");
    document.getElementById("totalFees").innerText = feesEth;
  } finally {
    refreshInProgress.platformFees = false;
  }
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
  // Prevent simultaneous refreshes
  if (refreshInProgress.disputedJobs) {
    console.log('Disputed jobs refresh already in progress, skipping...');
    return;
  }

  refreshInProgress.disputedJobs = true;

  try {
    const jobCount = await contract.methods.jobCount().call();
    const disputedList = document.getElementById("disputedJobsList");
    disputedList.innerHTML = "";

    const disputedJobs = [];

    for (let i = 1; i <= jobCount; i++) {
      const job = await contract.methods.jobs(i).call();
      
      // Only show jobs with Disputed status (status = 4)
      if (job.status == 4) {
        disputedJobs.push({ ...job, id: i });
      }
    }

    // Update pagination state
    paginationState.disputedJobs.totalItems = disputedJobs.length;
    paginationState.disputedJobs.currentPage = 1;

    if (disputedJobs.length === 0) {
      disputedList.innerHTML = '<p class="empty-state">No disputed jobs</p>';
      return;
    }

    // Render the table with pagination
    renderDisputedJobsTable(disputedJobs, disputedList);
  } finally {
    refreshInProgress.disputedJobs = false;
  }
}

// Render disputed jobs table with pagination
function renderDisputedJobsTable(allJobs, container) {
  const state = paginationState.disputedJobs;
  const start = (state.currentPage - 1) * state.itemsPerPage;
  const end = start + state.itemsPerPage;
  const paginatedJobs = allJobs.slice(start, end);

  let html = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Job Title</th>
            <th>Category</th>
            <th>Amount (ETH)</th>
            <th>Client</th>
            <th>Freelancer</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  `;

  paginatedJobs.forEach(job => {
    const agreedAmountEth = web3.utils.fromWei(job.agreedAmount, "ether");
    const shortClient = job.client.substring(0, 10) + "...";
    const shortFreelancer = job.freelancer.substring(0, 10) + "...";

    html += `
      <tr>
        <td><strong>${job.title}</strong></td>
        <td>${job.category}</td>
        <td>${agreedAmountEth}</td>
        <td title="${job.client}">${shortClient}</td>
        <td title="${job.freelancer}">${shortFreelancer}</td>
        <td>
          <button class="btn btn-danger btn-small" onclick="resolveDispute(${job.id}, false)">Refund</button>
          <button class="btn btn-success btn-small" onclick="resolveDispute(${job.id}, true)">Pay</button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  // Add pagination controls
  const totalPages = Math.ceil(state.totalItems / state.itemsPerPage);
  if (totalPages > 1) {
    html += createPaginationControls('disputedJobs', state.currentPage, totalPages, 'loadDisputedJobs');
  }

  container.innerHTML = html;
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


// Clean up event listeners
function cleanupEventListeners() {
  eventSubscriptions.forEach(subscription => {
    if (subscription && typeof subscription.unsubscribe === 'function') {
      subscription.unsubscribe();
    }
  });
  eventSubscriptions = [];
}

// Debounced refresh function wrapper
function debouncedRefresh(refreshKey, refreshFunction, delay = 500) {
  return async function() {
    // Clear any pending timeout
    if (refreshTimeouts[refreshKey]) {
      clearTimeout(refreshTimeouts[refreshKey]);
    }

    // Set a new timeout
    refreshTimeouts[refreshKey] = setTimeout(async () => {
      await refreshFunction();
    }, delay);
  };
}

// EVENT LISTENERS FOR AUTO-REFRESH

function setupEventListeners() {
  if (eventsInitialized) {
    return;
  }
  eventsInitialized = true;

  // Listen to JobPosted event
  const jobPostedSub = contract.events.JobPosted({})
    .on('data', async (event) => {
      console.log('Job Posted:', event.returnValues);
      if (currentUserRole === 1) {
        await debouncedRefresh('clientJobs', loadClientJobs, 500)();
      } else if (currentUserRole === 2) {
        await debouncedRefresh('jobMarketplace', loadJobMarketplace, 500)();
      }
    });
  eventSubscriptions.push(jobPostedSub);

  // Listen to BidPlaced event
  const bidPlacedSub = contract.events.BidPlaced({})
    .on('data', async (event) => {
      console.log('Bid Placed:', event.returnValues);
      if (currentUserRole === 1) {
        await debouncedRefresh('clientJobs', loadClientJobs, 500)();
      }
    });
  eventSubscriptions.push(bidPlacedSub);

  // Listen to FreelancerHired event
  const hiredSub = contract.events.FreelancerHired({})
    .on('data', async (event) => {
      console.log('Freelancer Hired:', event.returnValues);
      if (currentUserRole === 1) {
        await debouncedRefresh('clientJobs', loadClientJobs, 500)();
      } else if (currentUserRole === 2) {
        await debouncedRefresh('jobMarketplace', loadJobMarketplace, 500)();
        await debouncedRefresh('freelancerJobs', loadFreelancerJobs, 500)();
      }
    });
  eventSubscriptions.push(hiredSub);

  // Listen to WorkMarkedCompleted event
  const completedSub = contract.events.WorkMarkedCompleted({})
    .on('data', async (event) => {
      console.log('Work Marked Completed:', event.returnValues);
      if (currentUserRole === 1) {
        await debouncedRefresh('clientJobs', loadClientJobs, 500)();
      } else if (currentUserRole === 2) {
        await debouncedRefresh('freelancerJobs', loadFreelancerJobs, 500)();
      }
    });
  eventSubscriptions.push(completedSub);

  // Listen to WorkApproved event
  const approvedSub = contract.events.WorkApproved({})
    .on('data', async (event) => {
      console.log('Work Approved:', event.returnValues);
      if (currentUserRole === 1) {
        await debouncedRefresh('clientJobs', loadClientJobs, 500)();
      } else if (currentUserRole === 2) {
        await debouncedRefresh('freelancerJobs', loadFreelancerJobs, 500)();
      }
    });
  eventSubscriptions.push(approvedSub);

  // Listen to DisputeRaised event
  const raisedSub = contract.events.DisputeRaised({})
    .on('data', async (event) => {
      console.log('Dispute Raised:', event.returnValues);
      if (currentUserRole === 0) {
        await debouncedRefresh('disputedJobs', loadDisputedJobs, 500)();
      } else if (currentUserRole === 1) {
        await debouncedRefresh('clientJobs', loadClientJobs, 500)();
      }
    });
  eventSubscriptions.push(raisedSub);

  // Listen to DisputeResolved event
  const resolvedSub = contract.events.DisputeResolved({})
    .on('data', async (event) => {
      console.log('Dispute Resolved:', event.returnValues);
      if (currentUserRole === 0) {
        await debouncedRefresh('disputedJobs', loadDisputedJobs, 500)();
        await debouncedRefresh('platformFees', loadPlatformFees, 500)();
      } else if (currentUserRole === 1) {
        await debouncedRefresh('clientJobs', loadClientJobs, 500)();
      } else if (currentUserRole === 2) {
        await debouncedRefresh('freelancerJobs', loadFreelancerJobs, 500)();
      }
    });
  eventSubscriptions.push(resolvedSub);

  console.log('Event listeners setup complete');
}


// UTILITY FUNCTIONS

function getStatusText(status) {
  const statuses = ["Open", "InProgress", "Completed", "Closed", "Disputed", "Resolved"];
  return statuses[status] || "Unknown";
}