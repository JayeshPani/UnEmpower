// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WorkerRegistry
 * @notice Registry for workers in the UnEmpower system
 */
contract WorkerRegistry is Ownable {
    struct Worker {
        address wallet;
        string name;
        uint256 registeredAt;
        bool isActive;
    }

    mapping(address => Worker) public workers;
    address[] public workerAddresses;

    event WorkerRegistered(address indexed worker, string name, uint256 timestamp);
    event WorkerDeactivated(address indexed worker, uint256 timestamp);
    event WorkerReactivated(address indexed worker, uint256 timestamp);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register a new worker
     * @param _name Worker's display name
     */
    function registerWorker(string calldata _name) external {
        require(workers[msg.sender].wallet == address(0), "Already registered");
        require(bytes(_name).length > 0, "Name required");

        workers[msg.sender] = Worker({
            wallet: msg.sender,
            name: _name,
            registeredAt: block.timestamp,
            isActive: true
        });

        workerAddresses.push(msg.sender);

        emit WorkerRegistered(msg.sender, _name, block.timestamp);
    }

    /**
     * @notice Check if an address is a registered active worker
     */
    function isActiveWorker(address _worker) external view returns (bool) {
        return workers[_worker].isActive;
    }

    /**
     * @notice Get worker details
     */
    function getWorker(address _worker) external view returns (Worker memory) {
        return workers[_worker];
    }

    /**
     * @notice Deactivate a worker (owner only)
     */
    function deactivateWorker(address _worker) external onlyOwner {
        require(workers[_worker].wallet != address(0), "Not registered");
        workers[_worker].isActive = false;
        emit WorkerDeactivated(_worker, block.timestamp);
    }

    /**
     * @notice Reactivate a worker (owner only)
     */
    function reactivateWorker(address _worker) external onlyOwner {
        require(workers[_worker].wallet != address(0), "Not registered");
        workers[_worker].isActive = true;
        emit WorkerReactivated(_worker, block.timestamp);
    }

    /**
     * @notice Get total number of registered workers
     */
    function getWorkerCount() external view returns (uint256) {
        return workerAddresses.length;
    }
}
