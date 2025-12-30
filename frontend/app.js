let web3;
let contract;
let account;

const connectBtn = document.getElementById("connectBtn");
const registerBtn = document.getElementById("registerBtn");

connectBtn.onclick = connectWallet;

async function connectWallet() {
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

  checkRegistration();
}

async function checkRegistration() {
  const user = await contract.methods.users(account).call();

  if (user.registered) {
    showHomepage(user);
  } else {
    document.getElementById("registration").style.display = "block";
  }
}


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


function showHomepage(user) {
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
}
