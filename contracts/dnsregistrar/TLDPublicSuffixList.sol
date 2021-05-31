pragma solidity ^0.7.0;

import "@ensdomains/dnssec-oracle/contracts/BytesUtils.sol";
import "./PublicSuffixList.sol";

/**
 * @dev A public suffix list that treats all TLDs as public suffixes.
 */
contract TLDPublicSuffixList is PublicSuffixList {
    using BytesUtils for bytes;

    function isPublicSuffix(bytes calldata name) external override view returns(bool) {
        uint labellen = name.readUint8(0);
        return labellen > 0 && name.readUint8(labellen + 1) == 0;
    }
}
