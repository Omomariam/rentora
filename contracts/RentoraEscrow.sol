// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RentoraEscrow
/// @notice Native-BOT rental agreements with a refundable security deposit.
/// @dev Prototype contract. Obtain an independent audit before production use.
contract RentoraEscrow {
    enum RentalStatus { None, Booked, Active, Completed, Cancelled }

    struct Listing {
        address payable owner;
        uint96 dailyRate;
        uint96 deposit;
        uint32 maxDurationDays;
        bool active;
        bool available;
        string metadataURI;
    }

    struct Rental {
        uint256 listingId;
        address payable renter;
        uint64 startTime;
        uint64 endTime;
        uint96 rentalFee;
        uint96 deposit;
        RentalStatus status;
    }

    uint256 public listingCount;
    uint256 public rentalCount;
    uint256 private unlocked = 1;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Rental) public rentals;
    mapping(address => uint256[]) private ownerListingIds;
    mapping(address => uint256[]) private renterRentalIds;

    event ListingCreated(uint256 indexed listingId, address indexed owner, uint256 dailyRate, uint256 deposit);
    event ListingAvailabilityChanged(uint256 indexed listingId, bool active);
    event RentalBooked(uint256 indexed rentalId, uint256 indexed listingId, address indexed renter, uint256 startTime, uint256 endTime);
    event RentalStarted(uint256 indexed rentalId);
    event RentalCompleted(uint256 indexed rentalId, uint256 ownerPayment, uint256 depositRefund);
    event RentalCancelled(uint256 indexed rentalId, uint256 refund);

    error Unauthorized();
    error InvalidTerms();
    error InvalidStatus();
    error NotAvailable();
    error IncorrectPayment();
    error TransferFailed();

    modifier nonReentrant() {
        require(unlocked == 1, "REENTRANCY");
        unlocked = 2;
        _;
        unlocked = 1;
    }

    function createListing(
        uint96 dailyRate,
        uint96 deposit,
        uint32 maxDurationDays,
        string calldata metadataURI
    ) external returns (uint256 listingId) {
        if (dailyRate == 0 || maxDurationDays == 0 || bytes(metadataURI).length == 0) revert InvalidTerms();

        listingId = ++listingCount;
        listings[listingId] = Listing({
            owner: payable(msg.sender),
            dailyRate: dailyRate,
            deposit: deposit,
            maxDurationDays: maxDurationDays,
            active: true,
            available: true,
            metadataURI: metadataURI
        });
        ownerListingIds[msg.sender].push(listingId);

        emit ListingCreated(listingId, msg.sender, dailyRate, deposit);
    }

    function setListingActive(uint256 listingId, bool active) external {
        Listing storage listing = listings[listingId];
        if (listing.owner != msg.sender) revert Unauthorized();
        listing.active = active;
        emit ListingAvailabilityChanged(listingId, active);
    }

    function quote(uint256 listingId, uint64 startTime, uint64 endTime)
        public
        view
        returns (uint256 rentalFee, uint256 totalDue)
    {
        Listing storage listing = listings[listingId];
        if (startTime <= block.timestamp || endTime <= startTime) revert InvalidTerms();

        uint256 duration = uint256(endTime) - uint256(startTime);
        uint256 daysCharged = (duration + 1 days - 1) / 1 days;
        if (daysCharged == 0 || daysCharged > listing.maxDurationDays) revert InvalidTerms();

        rentalFee = daysCharged * uint256(listing.dailyRate);
        totalDue = rentalFee + uint256(listing.deposit);
    }

    function book(uint256 listingId, uint64 startTime, uint64 endTime)
        external
        payable
        returns (uint256 rentalId)
    {
        Listing storage listing = listings[listingId];
        if (!listing.active || !listing.available) revert NotAvailable();
        if (listing.owner == msg.sender) revert InvalidTerms();

        (uint256 fee, uint256 total) = quote(listingId, startTime, endTime);
        if (msg.value != total || fee > type(uint96).max) revert IncorrectPayment();

        listing.available = false;
        rentalId = ++rentalCount;
        rentals[rentalId] = Rental({
            listingId: listingId,
            renter: payable(msg.sender),
            startTime: startTime,
            endTime: endTime,
            rentalFee: uint96(fee),
            deposit: listing.deposit,
            status: RentalStatus.Booked
        });
        renterRentalIds[msg.sender].push(rentalId);

        emit RentalBooked(rentalId, listingId, msg.sender, startTime, endTime);
    }

    function startRental(uint256 rentalId) external {
        Rental storage rental = rentals[rentalId];
        if (rental.renter != msg.sender) revert Unauthorized();
        if (rental.status != RentalStatus.Booked || block.timestamp < rental.startTime) revert InvalidStatus();
        rental.status = RentalStatus.Active;
        emit RentalStarted(rentalId);
    }

    function completeRental(uint256 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        Listing storage listing = listings[rental.listingId];
        bool renterCanComplete = msg.sender == rental.renter && rental.status == RentalStatus.Active;
        bool ownerCanComplete = msg.sender == listing.owner && block.timestamp >= rental.endTime &&
            (rental.status == RentalStatus.Booked || rental.status == RentalStatus.Active);
        if (!renterCanComplete && !ownerCanComplete) revert Unauthorized();

        rental.status = RentalStatus.Completed;
        listing.available = true;
        uint256 fee = rental.rentalFee;
        uint256 deposit = rental.deposit;

        (bool ownerPaid,) = listing.owner.call{value: fee}("");
        if (!ownerPaid) revert TransferFailed();
        (bool renterRefunded,) = rental.renter.call{value: deposit}("");
        if (!renterRefunded) revert TransferFailed();

        emit RentalCompleted(rentalId, fee, deposit);
    }

    function cancelBeforeStart(uint256 rentalId) external nonReentrant {
        Rental storage rental = rentals[rentalId];
        if (rental.renter != msg.sender) revert Unauthorized();
        if (rental.status != RentalStatus.Booked || block.timestamp >= rental.startTime) revert InvalidStatus();

        rental.status = RentalStatus.Cancelled;
        listings[rental.listingId].available = true;
        uint256 refund = uint256(rental.rentalFee) + uint256(rental.deposit);
        (bool refunded,) = rental.renter.call{value: refund}("");
        if (!refunded) revert TransferFailed();

        emit RentalCancelled(rentalId, refund);
    }

    function getOwnerListingIds(address owner) external view returns (uint256[] memory) {
        return ownerListingIds[owner];
    }

    function getRenterRentalIds(address renter) external view returns (uint256[] memory) {
        return renterRentalIds[renter];
    }
}
