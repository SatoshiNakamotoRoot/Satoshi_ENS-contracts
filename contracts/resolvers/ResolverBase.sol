// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/utils/introspection/ERC165Storage.sol";
import "./profiles/IVersionableResolver.sol";

abstract contract ResolverBase is ERC165Storage, IVersionableResolver {
    mapping(bytes32 => uint64) public recordVersions;

    function isAuthorised(bytes32 node) internal view virtual returns (bool);

    modifier authorised(bytes32 node) {
        require(isAuthorised(node));
        _;
    }

    constructor() {
        _registerInterface(type(IVersionableResolver).interfaceId);
    }

    /**
     * Increments the record version associated with an ENS node.
     * May only be called by the owner of that node in the ENS registry.
     * @param node The node to update.
     */
    function clearRecords(bytes32 node) public virtual authorised(node) {
        recordVersions[node]++;
        emit VersionChanged(node, recordVersions[node]);
    }
}
