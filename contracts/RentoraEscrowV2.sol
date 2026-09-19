// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RentoraEscrowV2
/// @notice Native-BOT rental agreements with owner acceptance, scheduled availability, and pull-payment settlement.
contract RentoraEscrowV2 {
    enum RentalStatus { None, Booked, Accepted, Active, Completed, Cancelled }

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
    mapping(uint256 => uint256[]) private listingRentalIds;
    mapping(address => uint256) public pendingWithdrawals;

    event ListingCreated(uint256 indexed listingId, address indexed owner, uint256 dailyRate, uint256 deposit);
    event ListingAvailabilityChanged(uint256 indexed listingId, bool active);
    event RentalBooked(uint256 indexed rentalId, uint256 indexed listingId, address indexed renter, uint256 startTime, uint256 endTime);
    event RentalAccepted(uint256 indexed rentalId, address indexed owner);
    event RentalStarted(uint256 indexed rentalId);
    event RentalCompleted(uint256 indexed rentalId, uint256 ownerCredit, uint256 renterCredit);
    event RentalCancelled(uint256 indexed rentalId, address indexed cancelledBy, uint256 renterCredit);
    event Withdrawal(address indexed account, uint256 amount);

    error Unauthorized();
    error InvalidTerms();
    error InvalidStatus();
    error NotAvailable();
    error DateUnavailable();
    error IncorrectPayment();
    error NothingToWithdraw();
    error TransferFailed();

    modifier nonReentrant() {
        require(unlocked == 1, "REENTRANCY");
        unlocked = 2;
        _;
        unlocked = 1;
    }

    function createListing(uint96 dailyRate, uint96 deposit, uint32 maxDurationDays, string calldata metadataURI)
        external
        returns (uint256 listingId)
    {
        if (dailyRate == 0 || maxDurationDays == 0 || bytes(metadataURI).length == 0 || bytes(metadataURI).length > 4096) {
            revert InvalidTerms();
        }

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
        listing.available = active;
        emit ListingAvailabilityChanged(listingId, active);
    }

    function quote(uint256 listingId, uint64 startTime, uint64 endTime)
        public
        view
        returns (uint256 rentalFee, uint256 totalDue)
    {
        Listing storage listing = listings[listingId];
        if (!listing.active || !listing.available) revert NotAvailable();
        if (startTime <= block.timestamp || endTime <= startTime) revert InvalidTerms();

        uint256 duration = uint256(endTime) - uint256(startTime);
        uint256 daysCharged = (duration + 1 days - 1) / 1 days;
        if (daysCharged == 0 || daysCharged > listing.maxDurationDays) revert InvalidTerms();
        if (!_datesAvailable(listingId, startTime, endTime)) revert DateUnavailable();

        rentalFee = daysCharged * uint256(listing.dailyRate);
        totalDue = rentalFee + uint256(listing.deposit);
    }

    function book(uint256 listingId, uint64 startTime, uint64 endTime)
        external
        payable
        returns (uint256 rentalId)
    {
        Listing storage listing = listings[listingId];
        if (listing.owner == msg.sender) revert InvalidTerms();
        (uint256 fee, uint256 total) = quote(listingId, startTime, endTime);
        if (msg.value != total || fee > type(uint96).max) revert IncorrectPayment();

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
        listingRentalIds[listingId].push(rentalId);
        emit RentalBooked(rentalId, listingId, msg.sender, startTime, endTime);
    }

    function acceptRental(uint256 rentalId) external {
        Rental storage rental = rentals[rentalId];
        Listing storage listing = listings[rental.listingId];
        if (listing.owner != msg.sender) revert Unauthorized();
        if (rental.status != RentalStatus.Booked || block.timestamp >= rental.startTime) revert InvalidStatus();
        rental.status = RentalStatus.Accepted;
        emit RentalAccepted(rentalId, msg.sender);
    }

    function startRental(uint256 rentalId) external {
        Rental storage rental = rentals[rentalId];
        if (rental.renter != msg.sender) revert Unauthorized();
        if (rental.status != RentalStatus.Accepted || block.timestamp < rental.startTime || block.timestamp >= rental.endTime) {
            revert InvalidStatus();
        }
        rental.status = RentalStatus.Active;
        emit RentalStarted(rentalId);
    }

    function completeRental(uint256 rentalId) external {
        Rental storage rental = rentals[rentalId];
        Listing storage listing = listings[rental.listingId];
        bool renterCanComplete = msg.sender == rental.renter && rental.status == RentalStatus.Active;
        bool ownerCanComplete = msg.sender == listing.owner && block.timestamp >= rental.endTime &&
            (rental.status == RentalStatus.Accepted || rental.status == RentalStatus.Active);
        if (!renterCanComplete && !ownerCanComplete) revert Unauthorized();

        rental.status = RentalStatus.Completed;
        pendingWithdrawals[listing.owner] += rental.rentalFee;
        pendingWithdrawals[rental.renter] += rental.deposit;
        emit RentalCompleted(rentalId, rental.rentalFee, rental.deposit);
    }

    function cancelBeforeStart(uint256 rentalId) external {
        Rental storage rental = rentals[rentalId];
        if (rental.renter != msg.sender) revert Unauthorized();
        if ((rental.status != RentalStatus.Booked && rental.status != RentalStatus.Accepted) || block.timestamp >= rental.startTime) {
            revert InvalidStatus();
        }
        _cancelAndCredit(rentalId, msg.sender);
    }

    function ownerCancelBeforeStart(uint256 rentalId) external {
        Rental storage rental = rentals[rentalId];
        if (listings[rental.listingId].owner != msg.sender) revert Unauthorized();
        if ((rental.status != RentalStatus.Booked && rental.status != RentalStatus.Accepted) || block.timestamp >= rental.startTime) {
            revert InvalidStatus();
        }
        _cancelAndCredit(rentalId, msg.sender);
    }

    function refundUnaccepted(uint256 rentalId) external {
        Rental storage rental = rentals[rentalId];
        if (rental.renter != msg.sender) revert Unauthorized();
        if (rental.status != RentalStatus.Booked || block.timestamp < rental.startTime) revert InvalidStatus();
        _cancelAndCredit(rentalId, msg.sender);
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool success,) = payable(msg.sender).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    function datesAvailable(uint256 listingId, uint64 startTime, uint64 endTime) external view returns (bool) {
        if (startTime <= block.timestamp || endTime <= startTime) return false;
        return listings[listingId].active && listings[listingId].available && _datesAvailable(listingId, startTime, endTime);
    }

    function getOwnerListingIds(address owner) external view returns (uint256[] memory) { return ownerListingIds[owner]; }
    function getRenterRentalIds(address renter) external view returns (uint256[] memory) { return renterRentalIds[renter]; }
    function getListingRentalIds(uint256 listingId) external view returns (uint256[] memory) { return listingRentalIds[listingId]; }

    function _datesAvailable(uint256 listingId, uint64 startTime, uint64 endTime) private view returns (bool) {
        uint256[] storage ids = listingRentalIds[listingId];
        for (uint256 index = 0; index < ids.length; index++) {
            Rental storage existing = rentals[ids[index]];
            bool reservesDates = existing.status == RentalStatus.Booked || existing.status == RentalStatus.Accepted ||
                existing.status == RentalStatus.Active;
            if (reservesDates && startTime < existing.endTime && endTime > existing.startTime) return false;
        }
        return true;
    }

    function _cancelAndCredit(uint256 rentalId, address cancelledBy) private {
        Rental storage rental = rentals[rentalId];
        rental.status = RentalStatus.Cancelled;
        uint256 refund = uint256(rental.rentalFee) + uint256(rental.deposit);
        pendingWithdrawals[rental.renter] += refund;
        emit RentalCancelled(rentalId, cancelledBy, refund);
    }
}
