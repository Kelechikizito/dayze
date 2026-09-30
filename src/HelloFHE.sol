// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {FHE, euint64, externalEuint64} from "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract HelloFHE {
    uint64 public stored;

    function set(externalEuint64 v, bytes calldata proof) external {
        stored = FHE.asEuint64(v, proof);
        FHE.allowThis(stored); // contract can reuse it in later txs
        FHE.allowSender(stored); // caller can unseal it
    }

    function double() external {
        stored = FHE.add(stored, stored);
        FHE.allowThis(stored); // EVERY new handle needs fresh allows
        FHE.allowSender(stored);
    }
}
