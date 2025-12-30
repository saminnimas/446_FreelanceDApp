// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.16;

contract FreelanceMarketplace {

    constructor() {
        arbiter = msg.sender;

        users[msg.sender] = User(
            "Admin",
            Role.Arbiter,
            0,
            true
        );
    }

    enum Role {Arbiter, Client, Freelancer}
    address public arbiter;

    enum JobStatus {Open, InProgress, Completed, Closed, Disputed, Resolved}
    uint public jobCount = 0;
    uint public collectedFees = 0;

    event ClientRegistered(address indexed client, string name);
    event FreelancerRegistered(address indexed freelancer, string name);
    event JobPosted(uint indexed jobId, address indexed client, string title, uint maxBudget, uint deadline);
    event BidPlaced(uint indexed jobId, address indexed freelancer, uint amount, uint timeRequired);
    event FreelancerHired(uint indexed jobId, address indexed client, address indexed freelancer, uint amount);
    event WorkMarkedCompleted(uint indexed jobId, address indexed freelancer);
    event WorkApproved(uint indexed jobId, address indexed client, address indexed freelancer, uint paidToFreelancer, uint fee);
    event DisputeRaised(uint indexed jobId, address indexed client);
    event DisputeResolved(uint indexed jobId, bool paidFreelancer, uint winnerPaid, uint fee);
    event FeesWithdrawn(address indexed arbiter, uint amount);

    struct User {
        string name;
        Role role;
        uint reputation;     
        bool registered;
    }

    mapping(address => User) public users;



    function registerClient(string memory _name) public {
        require(!users[msg.sender].registered, "Already registered");
        require(bytes(_name).length > 0, "Name required");

        users[msg.sender] = User(
            _name,
            Role.Client,
            0,
            true
        );

        emit ClientRegistered(msg.sender, _name);
    }

    function registerFreelancer(string memory _name) public {
        require(!users[msg.sender].registered, "Already registered");
        require(bytes(_name).length > 0, "Name required");

        users[msg.sender] = User(
            _name,
            Role.Freelancer,
            100,
            true
        );

        emit FreelancerRegistered(msg.sender, _name);
    }

    modifier onlyArbiter() {
        require(msg.sender == arbiter, "Only arbiter allowed");
        _;
    }

    modifier onlyClient() {
        require(users[msg.sender].role == Role.Client, "Only client allowed");
        _;
    }

    modifier onlyFreelancer() {
        require(users[msg.sender].role == Role.Freelancer, "Only freelancer allowed");
        _;
    }

    modifier jobExists(uint _jobId) {
        require(_jobId > 0 && _jobId <= jobCount, "Job does not exist");
        require(jobs[_jobId].id != 0, "Job not found");
        _;
    }

    modifier onlyJobClient(uint _jobId) {
        require(jobs[_jobId].client == msg.sender, "Not job client");
        _;
    }

    struct Job {
        uint id;
        address client;
        string title;
        string category;
        uint maxBudget;
        uint deadline;
        JobStatus status;

        address freelancer;
        uint agreedAmount; 
    }

    mapping(uint => Job) public jobs;

    struct Bid {
        address freelancer;
        uint amount;
        uint timeRequired;
    }

    mapping(uint => Bid[]) public jobBids;
    mapping(uint => mapping(address => bool)) private hasBid;

    bool private locked;

    modifier nonReentrant() {
        require(!locked, "Reentrancy");
        locked = true;
        _;
        locked = false;
    }

    function postJob(
        string memory _title,
        string memory _category,
        uint _budget,
        uint _deadline
    ) public onlyClient {
        require(bytes(_title).length > 0, "Title required");
        require(bytes(_category).length > 0, "Category required");
        require(_budget > 0, "Budget must be > 0");
        require(_deadline > block.timestamp, "Deadline must be in future");

        jobCount++;

        jobs[jobCount] = Job(
            jobCount,
            msg.sender,
            _title,
            _category,
            _budget,
            _deadline,
            JobStatus.Open,
            address(0),
            0
        );

        emit JobPosted(jobCount, msg.sender, _title, _budget, _deadline);
    }

    function placeBid(
        uint _jobId,
        uint _amount,
        uint _time
    ) public onlyFreelancer jobExists(_jobId) {
        Job storage job = jobs[_jobId];

        require(job.status == JobStatus.Open, "Job not open");
        require(block.timestamp < job.deadline, "Job deadline passed");
        require(_amount > 0, "Amount must be > 0");
        require(_time > 0, "Time must be > 0");
        require(_amount <= job.maxBudget, "Over budget");
        require(users[msg.sender].reputation >= 50, "Low reputation");
        require(!hasBid[_jobId][msg.sender], "Already bid");

        hasBid[_jobId][msg.sender] = true;

        jobBids[_jobId].push(
            Bid(msg.sender, _amount, _time)
        );

        emit BidPlaced(_jobId, msg.sender, _amount, _time);
    }

    function hireFreelancer(
        uint _jobId,
        uint _bidIndex
    ) public payable onlyClient jobExists(_jobId) onlyJobClient(_jobId) {
        Job storage job = jobs[_jobId];

        require(job.status == JobStatus.Open, "Job not open");
        require(_bidIndex < jobBids[_jobId].length, "Invalid bid index");

        Bid storage bid = jobBids[_jobId][_bidIndex];

        require(bid.freelancer != address(0), "Invalid freelancer");
        require(users[bid.freelancer].role == Role.Freelancer, "Bidder not freelancer");
        require(block.timestamp < job.deadline, "Job deadline passed");
        require(msg.value == bid.amount, "Wrong escrow amount");

        job.freelancer = bid.freelancer;
        job.agreedAmount = bid.amount;
        job.status = JobStatus.InProgress;

        emit FreelancerHired(_jobId, msg.sender, bid.freelancer, bid.amount);
    }

    function markWorkCompleted(uint _jobId)
        public
        onlyFreelancer
        jobExists(_jobId)
    {
        Job storage job = jobs[_jobId];

        require(job.freelancer == msg.sender, "Not hired");
        require(job.status == JobStatus.InProgress, "Wrong state");

        job.status = JobStatus.Completed;

        emit WorkMarkedCompleted(_jobId, msg.sender);
    }

    function approveWork(uint _jobId)
        public
        onlyClient
        jobExists(_jobId)
        onlyJobClient(_jobId)
        nonReentrant
    {
        Job storage job = jobs[_jobId];

        require(job.status == JobStatus.Completed, "Work not completed");
        require(job.freelancer != address(0), "No freelancer");
        require(job.agreedAmount > 0, "No escrow");

        uint fee = _computeFee(job.agreedAmount);
        uint payment = job.agreedAmount - fee;

        job.status = JobStatus.Closed;
        job.agreedAmount = 0;

        collectedFees += fee;
        users[job.freelancer].reputation += 10;

        _payout(payable(job.freelancer), payment);

        emit WorkApproved(_jobId, msg.sender, job.freelancer, payment, fee);
    }

    function raiseDispute(uint _jobId)
    public
    onlyClient
    jobExists(_jobId)
    onlyJobClient(_jobId)
    {
    Job storage job = jobs[_jobId];
    require(job.status == JobStatus.Completed, "Cannot dispute");

    job.status = JobStatus.Disputed;

    emit DisputeRaised(_jobId, msg.sender);
    }

    function resolveDispute(
        uint _jobId,
        bool payFreelancer
    )
        public
        onlyArbiter
        jobExists(_jobId)
        nonReentrant
    {
        Job storage job = jobs[_jobId];
        require(job.status == JobStatus.Disputed, "No dispute");
        require(job.agreedAmount > 0, "No escrow");

        uint amount = job.agreedAmount;

        job.status = JobStatus.Resolved;
        job.agreedAmount = 0;

        if (payFreelancer) {
            uint fee = _computeFee(amount);
            uint paidToFreelancer = amount - fee;

            collectedFees += fee;
            _payout(payable(job.freelancer), paidToFreelancer);

            emit DisputeResolved(_jobId, true, paidToFreelancer, fee);
        } else {
            _payout(payable(job.client), amount);

            if (users[job.freelancer].registered && users[job.freelancer].role == Role.Freelancer) {
                if (users[job.freelancer].reputation >= 20) {
                    users[job.freelancer].reputation -= 20;
                } else {
                    users[job.freelancer].reputation = 0;
                }
            }

            emit DisputeResolved(_jobId, false, amount, 0);
        }
    }

    function withdrawFees(address payable _to, uint _amount)
        public
        onlyArbiter
        nonReentrant
    {
        require(_to != address(0), "Bad recipient");
        require(_amount > 0, "Amount must be > 0");
        require(_amount <= collectedFees, "Insufficient fees");

        collectedFees -= _amount;
        _payout(_to, _amount);

        emit FeesWithdrawn(_to, _amount);
    }

    function _computeFee(uint _agreedAmount) internal pure returns (uint fee) {
        if (_agreedAmount < 1 ether) {
            fee = (_agreedAmount * 2) / 100;
        } else {
            fee = (_agreedAmount * 1) / 100;
        }
    }

    function _payout(address payable _to, uint _amount) internal {
        (bool ok, ) = _to.call{value: _amount}("");
        require(ok, "Payment failed");
    }
}
