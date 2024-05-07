const { solidity } = require('ethereum-waffle')
const { use, expect } = require('chai')
const namehash = require('eth-ens-namehash')
const { hexDataSlice, concat } = require('ethers/lib/utils')
const sha3 = require('web3-utils').sha3
const { Contract } = require('ethers')
const { ethers } = require('hardhat')
const { dns } = require('../test-utils')
const { writeFile } = require('fs/promises')
const { deploy } = require('../test-utils/contracts')

use(solidity)

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_BYTES32 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

contract('UniversalResolver2', function (accounts) {
  let ENSRegistry,
    PublicResolver,
    NameWrapper,
    UniversalResolver,
    DummyOffchainResolver,
    LegacyResolver,
    ReverseRegistrar
  /**
   * @type {Contract}
   */
  let ens,
    /**
     * @type {Contract}
     */
    publicResolver,
    /**
     * @type {Contract}
     */
    universalResolver,
    dummyOffchainResolver,
    nameWrapper,
    reverseRegistrar,
    reverseNode,
    reverseNode1,
    batchGateway,
    multicallGateway,
    dummyOldResolver,
    dummyRevertResolver

  before(async () => {
    batchGateway = (await ethers.getContractAt('BatchGateway2', ZERO_ADDRESS))
      .interface
    multicallGateway = (
      await ethers.getContractAt('MulticallableGateway', ZERO_ADDRESS)
    ).interface
    ENSRegistry = await ethers.getContractFactory('ENSRegistry')
    PublicResolver = await ethers.getContractFactory('PublicResolver')
    NameWrapper = await ethers.getContractFactory('DummyNameWrapper')
    UniversalResolver = await ethers.getContractFactory('UniversalResolver2')
    DummyOffchainResolver = await ethers.getContractFactory(
      'DummyOffchainResolver',
    )
    LegacyResolver = await ethers.getContractFactory('LegacyResolver')
    ReverseRegistrar = await ethers.getContractFactory('ReverseRegistrar')
  })

  beforeEach(async () => {
    node = namehash.hash('eth')
    ens = await deploy('ENSRegistry')
    nameWrapper = await deploy('DummyNameWrapper')
    reverseRegistrar = await deploy('ReverseRegistrar', ens.address)
    reverseNode = accounts[0].toLowerCase().substring(2) + '.addr.reverse'
    reverseNode1 = accounts[1].toLowerCase().substring(2) + '.addr.reverse'
    oldResolverReverseNode =
      accounts[10].toLowerCase().substring(2) + '.addr.reverse'
    await ens.setSubnodeOwner(EMPTY_BYTES32, sha3('reverse'), accounts[0], {
      from: accounts[0],
    })
    await ens.setSubnodeOwner(
      namehash.hash('reverse'),
      sha3('addr'),
      reverseRegistrar.address,
      { from: accounts[0] },
    )
    publicResolver = await deploy(
      'PublicResolver',
      ens.address,
      nameWrapper.address,
      ZERO_ADDRESS,
      ZERO_ADDRESS,
    )
    universalResolver = await deploy('UniversalResolver2', ens.address, [
      'http://universal-offchain-resolver.local/',
    ])
    dummyOffchainResolver = await deploy('DummyOffchainResolver')
    dummyOldResolver = await deploy('DummyOldResolver')
    dummyRevertResolver = await deploy('DummyRevertResolver')

    await ens.setSubnodeOwner(EMPTY_BYTES32, sha3('eth'), accounts[0], {
      from: accounts[0],
    })
    await ens.setSubnodeOwner(namehash.hash('eth'), sha3('test'), accounts[0], {
      from: accounts[0],
    })
    await ens.setSubnodeRecord(
      namehash.hash('eth'),
      sha3('primaryname'),
      accounts[1],
      publicResolver.address,
      0,
      {
        from: accounts[0],
      },
    )
    await ens.setSubnodeRecord(
      namehash.hash('eth'),
      sha3('oldprimary'),
      accounts[10],
      dummyOldResolver.address,
      0,
      {
        from: accounts[0],
      },
    )
    await ens.setResolver(namehash.hash('test.eth'), publicResolver.address, {
      from: accounts[0],
    })
    await ens.setSubnodeOwner(
      namehash.hash('test.eth'),
      sha3('sub'),
      accounts[0],
      { from: accounts[0] },
    )
    await ens.setResolver(namehash.hash('sub.test.eth'), accounts[1], {
      from: accounts[0],
    })
    await publicResolver.functions['setAddr(bytes32,address)'](
      namehash.hash('test.eth'),
      accounts[1],
      { from: accounts[0] },
    )
    await publicResolver.functions['setText(bytes32,string,string)'](
      namehash.hash('test.eth'),
      'foo',
      'bar',
      { from: accounts[0] },
    )
    await ens.setSubnodeOwner(
      namehash.hash('test.eth'),
      sha3('offchain'),
      accounts[0],
      { from: accounts[0] },
    )
    await ens.setSubnodeOwner(
      namehash.hash('test.eth'),
      sha3('no-resolver'),
      accounts[0],
      { from: accounts[0] },
    )
    await ens.setSubnodeOwner(
      namehash.hash('test.eth'),
      sha3('revert-resolver'),
      accounts[0],
      { from: accounts[0] },
    )
    await ens.setSubnodeOwner(
      namehash.hash('test.eth'),
      sha3('non-contract-resolver'),
      accounts[0],
      { from: accounts[0] },
    )
    let name = 'test.eth'
    for (let i = 0; i < 5; i += 1) {
      const parent = name
      const label = `sub${i}`
      await ens.setSubnodeOwner(
        namehash.hash(parent),
        sha3(label),
        accounts[0],
        { from: accounts[0] },
      )
      name = `${label}.${parent}`
    }
    await ens.setResolver(
      namehash.hash('offchain.test.eth'),
      dummyOffchainResolver.address,
      { from: accounts[0] },
    )
    await ens.setResolver(
      namehash.hash('revert-resolver.test.eth'),
      dummyRevertResolver.address,
      { from: accounts[0] },
    )
    await ens.setResolver(
      namehash.hash('non-contract-resolver.test.eth'),
      accounts[0],
      { from: accounts[0] },
    )

    await reverseRegistrar.claim(accounts[0], {
      from: accounts[0],
    })
    await ens.setResolver(namehash.hash(reverseNode), publicResolver.address, {
      from: accounts[0],
    })
    await publicResolver.setName(namehash.hash(reverseNode), 'test.eth')

    const signer1 = await ethers.getSigner(accounts[1])
    const reverseRegistrar1 = reverseRegistrar.connect(signer1)
    const ens1 = ens.connect(signer1)
    const publicResolver1 = publicResolver.connect(signer1)

    await publicResolver1.functions['setAddr(bytes32,address)'](
      namehash.hash('primaryname.eth'),
      accounts[1],
    )

    await reverseRegistrar1.claim(accounts[1])
    await ens1.setResolver(namehash.hash(reverseNode1), publicResolver.address)
    await publicResolver1.setName(
      namehash.hash(reverseNode1),
      'primaryname.eth',
    )

    const signer10 = await ethers.getSigner(accounts[10])
    const reverseRegistrar10 = reverseRegistrar.connect(signer10)
    const ens10 = ens.connect(signer10)

    await reverseRegistrar10.claim(accounts[10])
    await ens10.setResolver(
      namehash.hash(oldResolverReverseNode),
      dummyOldResolver.address,
    )
  })

  const resolveCallbackSig = ethers.utils.hexDataSlice(
    ethers.utils.id('resolveCallback(bytes,bytes)'),
    0,
    4,
  )

  const internalCallCalldataRewriteSig = ethers.utils.hexDataSlice(
    ethers.utils.id(
      'internalCallCalldataRewrite((address,string[],bytes,bytes4,bytes))',
    ),
    0,
    4,
  )

  const resolveSig = ethers.utils.hexDataSlice(
    ethers.utils.id('resolve(bytes,bytes)'),
    0,
    4,
  )

  describe('findResolver()', () => {
    it('should find an exact match resolver', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('test.eth'),
      )
      expect(result['0']).to.equal(publicResolver.address)
    })

    it('should find a resolver on a parent name', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('foo.test.eth'),
      )
      expect(result['0']).to.equal(publicResolver.address)
    })

    it('should choose the resolver closest to the leaf', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('sub.test.eth'),
      )
      expect(result['0']).to.equal(accounts[1])
    })
    it('should allow encrypted labels', async () => {
      const result = await universalResolver.callStatic.findResolver(
        dns.hexEncodeName(
          '[9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658].eth',
        ),
      )
      expect(result['0']).to.equal(publicResolver.address)
    })
    it('should return the final offset for the found resolver', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('foo.test.eth'),
      )
      expect(result['2']).to.equal(4)
    })
    it('should find a resolver many levels up', async () => {
      const result = await universalResolver.findResolver(
        dns.hexEncodeName('sub4.sub3.sub2.sub1.sub0.test.eth'),
      )
      expect(result['0']).to.equal(publicResolver.address)
      expect(result['2']).to.equal(25)
    })
  })

  describe('resolve()', () => {
    it('should resolve a record via legacy methods', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('test.eth')],
      )

      const result = await universalResolver['resolve(bytes,bytes)'](
        dns.hexEncodeName('test.eth'),
        data,
      )
      console.log(result)
      const [returnAddress] = ethers.utils.defaultAbiCoder.decode(
        ['address'],
        result['0'],
      )
      expect(returnAddress).to.equal(accounts[1])
    })

    it('should resolve a multicall via legacy methods', async () => {
      const addrData = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('test.eth')],
      )

      const textData = publicResolver.interface.encodeFunctionData(
        'text(bytes32,string)',
        [namehash.hash('test.eth'), 'foo'],
      )

      const multicallData = publicResolver.interface.encodeFunctionData(
        'multicall',
        [[addrData, textData]],
      )

      const result = await universalResolver['resolve(bytes,bytes)'](
        dns.hexEncodeName('test.eth'),
        multicallData,
      )

      const [multicallResult] = publicResolver.interface.decodeFunctionResult(
        'multicall',
        result['0'],
      )

      const [addrResult] = publicResolver.interface.decodeFunctionResult(
        'addr(bytes32)',
        multicallResult[0],
      )
      const [textResult] = publicResolver.interface.decodeFunctionResult(
        'text(bytes32,string)',
        multicallResult[1],
      )

      expect(addrResult).to.equal(accounts[1])
      expect(textResult).to.equal('bar')
    })

    it('should throw if a resolver is not set on the queried name', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('no-resolver.test.other')],
      )

      await expect(
        universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('no-resolver.test.other'),
          data,
        ),
      ).to.be.revertedWith('ResolverNotFound')
    })

    it('should throw if a resolver is not a contract', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('non-contract-resolver.test.eth')],
      )

      await expect(
        universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('non-contract-resolver.test.eth'),
          data,
        ),
      ).to.be.revertedWith('ResolverNotContract')
    })

    it('should throw with revert data if resolver reverts', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('revert-resolver.test.eth')],
      )

      try {
        await universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('revert-resolver.test.eth'),
          data,
        )
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorName).to.equal('ResolverError')
        expect(e.errorSignature).to.equal('ResolverError(bytes)')
        const encodedInnerError = e.errorArgs[0]
        console.log(e)
        try {
          publicResolver.interface.decodeFunctionResult(
            'addr(bytes32)',
            encodedInnerError,
          )
          expect(false).to.be.true
        } catch (e) {
          expect(e.errorName).to.equal('Error')
          expect(e.errorSignature).to.equal('Error(string)')
          expect(e.errorArgs[0]).to.equal('Not Supported')
        }
      }
    })

    it('should throw if a resolver is not set on the queried name, and the found resolver does not support resolve()', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('no-resolver.test.eth')],
      )

      await expect(
        universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('no-resolver.test.eth'),
          data,
        ),
      ).to.be.revertedWith('ResolverWildcardNotSupported')
    })

    it('should resolve a record if `supportsInterface` throws', async () => {
      const legacyResolver = await LegacyResolver.deploy()
      await ens.setSubnodeOwner(
        namehash.hash('eth'),
        sha3('test2'),
        accounts[0],
        { from: accounts[0] },
      )
      await ens.setResolver(
        namehash.hash('test2.eth'),
        legacyResolver.address,
        { from: accounts[0] },
      )
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('test.eth')],
      )
      const result = await universalResolver['resolve(bytes,bytes)'](
        dns.hexEncodeName('test2.eth'),
        data,
      )
      const [ret] = ethers.utils.defaultAbiCoder.decode(
        ['address'],
        result['0'],
      )
      expect(ret).to.equal(legacyResolver.address)
    })

    it('should not run out of gas if calling a non-existent function on a legacy resolver', async () => {
      const legacyResolver = await LegacyResolver.deploy()
      await ens.setSubnodeOwner(
        namehash.hash('eth'),
        sha3('test2'),
        accounts[0],
        { from: accounts[0] },
      )
      await ens.setResolver(
        namehash.hash('test2.eth'),
        legacyResolver.address,
        { from: accounts[0] },
      )
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32,uint256)',
        [namehash.hash('test.eth'), 60],
      )
      try {
        await universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('test2.eth'),
          data,
        )
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorName).to.equal('ResolverError')
        expect(e.errorSignature).to.equal('ResolverError(bytes)')
        expect(e.errorArgs[0]).to.equal('0x')
      }
    })

    it('should return a wrapped revert if the resolver reverts with OffchainLookup', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('offchain.test.eth')],
      )

      const internalExtraData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'bool', 'bool'],
        [dummyOffchainResolver.address, true, true],
      )

      const externalExtraData = ethers.utils.defaultAbiCoder.encode(
        ['(bool,bool,bytes,bytes)[]', 'string[]'],
        [[[true, true, '0x', data]], ['https://example.com/']],
      )

      // address target,
      // bytes4 internalCallbackFunction,
      // bytes4 externalCallbackFunction,
      // bytes4 calldataRewriteFunction,
      // bytes memory internalExtraData,
      // bytes memory externalExtraData
      // This is the extraData value the universal resolver should encode
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'bytes4', 'bytes4', 'bytes4', 'bytes', 'bytes'],
        [
          universalResolver.address,
          resolveCallbackSig, // internal
          resolveCallbackSig, // external
          '0x00000000',
          internalExtraData,
          externalExtraData,
        ],
      )

      const extraDataDecoded = ethers.utils.defaultAbiCoder.decode(
        ['address', 'bytes4', 'bytes4', 'bytes4', 'bytes', 'bytes'],
        '0x000000000000000000000000a85233c63b9ee964add6f2cffe00fd84eb32338fb4a85801000000000000000000000000000000000000000000000000000000009183f03100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000000600000000000000000000000004a679253410272dd5232b3ff7cf5dbb88f295319000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000380000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000002e00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001a018aa514100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001400000000000000000000000004a679253410272dd5232b3ff7cf5dbb88f2953190dfe2cd200000000000000000000000000000000000000000000000000000000b4a8580100000000000000000000000000000000000000000000000000000000ee4ec3ac0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000243b3b57de50c169c478f1ade86aa54554f52a0da8a1f76c99f73f12945733146faa14d4dd00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000029687474703a2f2f756e6976657273616c2d6f6666636861696e2d7265736f6c7665722e6c6f63616c2f0000000000000000000000000000000000000000000000',
      )

      console.log(extraDataDecoded)

      const callData = multicallGateway.encodeFunctionData('multicall', [
        [
          batchGateway.encodeFunctionData('query', [
            dummyOffchainResolver.address,
            ['https://example.com/'],
            data,
          ]),
        ],
      ])

      try {
        await universalResolver['resolve(bytes,bytes)'](
          dns.hexEncodeName('offchain.test.eth'),
          data,
        )
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorName).to.equal('OffchainLookup')
        expect(e.errorArgs.sender).to.equal(universalResolver.address)
        expect(e.errorArgs.urls).to.deep.equal([
          'http://universal-offchain-resolver.local/',
        ])
        expect(e.errorArgs.callData).to.equal(callData)
        expect(e.errorArgs.callbackFunction).to.equal(
          ethers.utils.hexDataSlice(
            ethers.utils.id('callback(bytes,bytes)'),
            0,
            4,
          ),
        )
        expect(e.errorArgs.extraData).to.equal(extraData)
      }
    })
    it('should use custom gateways when specified', async () => {
      const data = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('offchain.test.eth')],
      )
      try {
        await universalResolver['resolve(bytes,bytes,string[])'](
          dns.hexEncodeName('offchain.test.eth'),
          data,
          ['https://custom-offchain-resolver.local/'],
        )
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorArgs.urls).to.deep.equal([
          'https://custom-offchain-resolver.local/',
        ])
      }
    })

    it('should return a wrapped revert with resolve() wrapped calls in extraData when combining onchain and offchain lookups', async () => {
      const addrData = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('offchain.test.eth')],
      )
      const onchainDataCall = '0x12345678'

      try {
        await universalResolver['resolve(bytes,bytes[])'](
          dns.hexEncodeName('offchain.test.eth'),
          [addrData, onchainDataCall],
        )
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorName).to.equal('OffchainLookup')
        expect(e.errorArgs.sender).to.equal(universalResolver.address)
        expect(e.errorArgs.urls).to.deep.equal([
          'http://universal-offchain-resolver.local/',
        ])
        const decodedCallData = batchGateway.decodeFunctionData(
          'query',
          e.errorArgs.callData,
        )
        expect(decodedCallData).to.deep.equal([
          [[dummyOffchainResolver.address, ['https://example.com/'], addrData]],
        ])
        expect(e.errorArgs.callbackFunction).to.equal(
          ethers.utils.hexDataSlice(
            ethers.utils.id('resolveCallback(bytes,bytes)'),
            0,
            4,
          ),
        )
        const decodedExtraData = ethers.utils.defaultAbiCoder.decode(
          ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
          e.errorArgs.extraData,
        )
        expect(decodedExtraData).to.deep.equal([
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [
            [resolveCallbackSig, addrData],
            [
              '0x00000000',
              // just using the UR interface for ensip10
              universalResolver.interface.encodeFunctionData(
                'resolve(bytes,bytes)',
                [dns.hexEncodeName('offchain.test.eth'), onchainDataCall],
              ),
            ],
          ],
        ])
      }
    })

    describe('batch', () => {
      it('should resolve multiple records onchain', async () => {
        const textData = publicResolver.interface.encodeFunctionData(
          'text(bytes32,string)',
          [namehash.hash('test.eth'), 'foo'],
        )
        const addrData = publicResolver.interface.encodeFunctionData(
          'addr(bytes32)',
          [namehash.hash('test.eth')],
        )
        const [[textResultEncoded, addrResultEncoded]] =
          await universalResolver['resolve(bytes,bytes[])'](
            dns.hexEncodeName('test.eth'),
            [textData, addrData],
          )
        expect(textResultEncoded.success).to.equal(true)
        expect(addrResultEncoded.success).to.equal(true)
        const [textRet] = publicResolver.interface.decodeFunctionResult(
          'text(bytes32,string)',
          textResultEncoded.returnData,
        )
        const [addrRet] = publicResolver.interface.decodeFunctionResult(
          'addr(bytes32)',
          addrResultEncoded.returnData,
        )
        expect(textRet).to.equal('bar')
        expect(addrRet).to.equal(accounts[1])
      })
      it('should resolve multiple records offchain', async () => {
        const textData = publicResolver.interface.encodeFunctionData(
          'text(bytes32,string)',
          [namehash.hash('offchain.test.eth'), 'foo'],
        )
        const addrData = publicResolver.interface.encodeFunctionData(
          'addr(bytes32)',
          [namehash.hash('offchain.test.eth')],
        )
        const callData = batchGateway.encodeFunctionData('query', [
          [
            [dummyOffchainResolver.address, ['https://example.com/'], textData],
            [dummyOffchainResolver.address, ['https://example.com/'], addrData],
          ],
        ])
        const extraData = ethers.utils.defaultAbiCoder.encode(
          ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
          [
            false,
            dummyOffchainResolver.address,
            ['http://universal-offchain-resolver.local/'],
            '0x',
            [
              [resolveCallbackSig, textData],
              [resolveCallbackSig, addrData],
            ],
          ],
        )
        try {
          await universalResolver['resolve(bytes,bytes[])'](
            dns.hexEncodeName('offchain.test.eth'),
            [textData, addrData],
          )
          expect(false).to.be.true
        } catch (e) {
          expect(e.errorName).to.equal('OffchainLookup')
          const decodedCallData = batchGateway.decodeFunctionData(
            'query',
            e.errorArgs.callData,
          )
          expect(decodedCallData).to.deep.equal([
            [
              [
                dummyOffchainResolver.address,
                ['https://example.com/'],
                textData,
              ],
              [
                dummyOffchainResolver.address,
                ['https://example.com/'],
                addrData,
              ],
            ],
          ])
          expect(e.errorArgs.callbackFunction).to.equal(resolveCallbackSig)
          expect(e.errorArgs.extraData).to.equal(extraData)
        }
      })
    })
  })

  describe('resolveSingleCallback', () => {
    it('should resolve a record via a callback from offchain lookup', async () => {
      const addrData = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('offchain.test.eth')],
      )
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [[resolveCallbackSig, addrData]],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [false],
        [addrData],
      ])

      const [encodedAddr, resolverAddress] =
        await universalResolver.callStatic.resolveSingleCallback(
          responses,
          extraData,
        )
      expect(resolverAddress).to.equal(dummyOffchainResolver.address)
      const [addrRet] = publicResolver.interface.decodeFunctionResult(
        'addr(bytes32)',
        encodedAddr,
      )
      expect(addrRet).to.equal(dummyOffchainResolver.address)
    })
    it('should propagate HttpError', async () => {
      const urWithHttpErrorAbi = new ethers.Contract(
        universalResolver.address,
        [
          ...universalResolver.interface.fragments,
          'error HttpError((uint16,string)[])',
        ],
        ethers.provider,
      )
      const errorData = urWithHttpErrorAbi.interface.encodeErrorResult(
        'HttpError',
        [[[404, 'Not Found']]],
      )
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [[resolveCallbackSig, errorData]],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [true],
        [errorData],
      ])

      try {
        await urWithHttpErrorAbi.callStatic.resolveSingleCallback(
          responses,
          extraData,
        )
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorName).to.equal('HttpError')
        expect(e.errorArgs).to.deep.equal([[[404, 'Not Found']]])
      }
    })
  })
  describe('resolveCallback', () => {
    it('should resolve records via a callback from offchain lookup', async () => {
      const addrData = publicResolver.interface.encodeFunctionData(
        'addr(bytes32)',
        [namehash.hash('offchain.test.eth')],
      )
      const textData = publicResolver.interface.encodeFunctionData(
        'text(bytes32,string)',
        [namehash.hash('offchain.test.eth'), 'foo'],
      )
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [
            [resolveCallbackSig, addrData],
            [resolveCallbackSig, textData],
          ],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [false, false],
        [addrData, textData],
      ])
      const [[encodedRes, encodedResTwo], resolverAddress] =
        await universalResolver.callStatic.resolveCallback(responses, extraData)
      expect(resolverAddress).to.equal(dummyOffchainResolver.address)
      expect(encodedRes.success).to.equal(true)
      expect(encodedResTwo.success).to.equal(true)
      const [addrRet] = publicResolver.interface.decodeFunctionResult(
        'addr(bytes32)',
        encodedRes.returnData,
      )
      const [addrRetTwo] = publicResolver.interface.decodeFunctionResult(
        'addr(bytes32)',
        encodedResTwo.returnData,
      )
      expect(addrRet).to.equal(dummyOffchainResolver.address)
      expect(addrRetTwo).to.equal(dummyOffchainResolver.address)
    })
    it('should not revert if there is an error in a call', async () => {
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [[resolveCallbackSig, '0x']],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [true],
        ['0x'],
      ])
      const [[encodedRes], resolverAddress] =
        await universalResolver.callStatic.resolveCallback(responses, extraData)
      expect(resolverAddress).to.equal(dummyOffchainResolver.address)
      expect(encodedRes.success).to.equal(false)
      expect(encodedRes.returnData).to.equal('0x')
    })
    it('should allow response at non-0 extraData index', async () => {
      const onchainCall = universalResolver.interface.encodeFunctionData(
        'resolve(bytes,bytes)',
        [dns.hexEncodeName('offchain.test.eth'), '0x12345678'],
      )
      const textData = publicResolver.interface.encodeFunctionData(
        'text(bytes32,string)',
        [namehash.hash('offchain.test.eth'), 'foo'],
      )
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [
            ['0x00000000', onchainCall],
            [resolveCallbackSig, textData],
          ],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [false],
        [textData],
      ])
      const [[encodedRes, encodedResTwo], resolverAddress] =
        await universalResolver.callStatic.resolveCallback(responses, extraData)
      expect(encodedRes.success).to.equal(true)
      expect(encodedResTwo.success).to.equal(true)
      const [fooString] = ethers.utils.defaultAbiCoder.decode(
        ['bytes'],
        encodedRes.returnData,
      )
      const [addrRetTwo] = publicResolver.interface.decodeFunctionResult(
        'addr(bytes32)',
        encodedResTwo.returnData,
      )
      expect(ethers.utils.toUtf8String(fooString)).to.equal('foo')
      expect(addrRetTwo).to.equal(dummyOffchainResolver.address)
      expect(resolverAddress).to.equal(dummyOffchainResolver.address)
    })
    it('should gracefully handle a non-existent function on an offchain resolver', async () => {
      const addrData = publicResolver.interface.encodeFunctionData(
        'addr(bytes32,uint256)',
        [namehash.hash('offchain.test.eth'), 60],
      )
      const textData = publicResolver.interface.encodeFunctionData(
        'text(bytes32,string)',
        [namehash.hash('offchain.test.eth'), 'foo'],
      )
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [
            ['0x00000000', addrData],
            [resolveCallbackSig, textData],
          ],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [false],
        [textData],
      ])
      const [[addr, text], resolver] =
        await universalResolver.callStatic.resolveCallback(responses, extraData)
      expect(text.success).to.equal(true)
      const [addrRetFromText] = publicResolver.interface.decodeFunctionResult(
        'addr(bytes32)',
        text.returnData,
      )
      expect(addr.returnData).to.equal('0x')
      expect(addrRetFromText).to.equal(dummyOffchainResolver.address)
      expect(resolver).to.equal(dummyOffchainResolver.address)
    })
  })
  describe('reverseCallback', () => {
    it('should revert with metadata for initial forward resolution if required', async () => {
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [[resolveCallbackSig, '0x691f3431']],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [false],
        ['0x691f3431'],
      ])
      try {
        await universalResolver.callStatic.reverseCallback(responses, extraData)
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorName).to.equal('OffchainLookup')
        const extraDataReturned = ethers.utils.defaultAbiCoder.decode(
          ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
          e.errorArgs.extraData,
        )
        const metaData = ethers.utils.defaultAbiCoder.decode(
          ['string', 'address'],
          extraDataReturned[3],
        )
        expect(metaData[0]).to.equal('offchain.test.eth')
        expect(metaData[1]).to.equal(dummyOffchainResolver.address)
      }
    })
    it('should resolve address record via a callback from offchain lookup', async () => {
      const metaData = ethers.utils.defaultAbiCoder.encode(
        ['string', 'address'],
        ['offchain.test.eth', dummyOffchainResolver.address],
      )
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          metaData,
          [[resolveCallbackSig, '0x']],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [false],
        ['0x'],
      ])
      const [name, a1, a2, a3] = await universalResolver.reverseCallback(
        responses,
        extraData,
      )
      expect(name).to.equal('offchain.test.eth')
      expect(a1).to.equal(dummyOffchainResolver.address)
      expect(a2).to.equal(dummyOffchainResolver.address)
      expect(a3).to.equal(dummyOffchainResolver.address)
    })
    it('should propagate HttpError', async () => {
      const urWithHttpErrorAbi = new ethers.Contract(
        universalResolver.address,
        [
          ...universalResolver.interface.fragments,
          'error HttpError((uint16,string)[])',
        ],
        ethers.provider,
      )
      const errorData = urWithHttpErrorAbi.interface.encodeErrorResult(
        'HttpError',
        [[[404, 'Not Found']]],
      )
      const extraData = ethers.utils.defaultAbiCoder.encode(
        ['bool', 'address', 'string[]', 'bytes', '(bytes4,bytes)[]'],
        [
          false,
          dummyOffchainResolver.address,
          ['http://universal-offchain-resolver.local/'],
          '0x',
          [[resolveCallbackSig, errorData]],
        ],
      )
      const responses = batchGateway.encodeFunctionResult('query', [
        [true],
        [errorData],
      ])

      try {
        await urWithHttpErrorAbi.callStatic.reverseCallback(
          responses,
          extraData,
        )
        expect(false).to.be.true
      } catch (e) {
        expect(e.errorName).to.equal('HttpError')
        expect(e.errorArgs).to.deep.equal([[[404, 'Not Found']]])
      }
    })
  })

  describe.only('reverse()', () => {
    it('should resolve a reverse record with name and resolver address', async () => {
      const result = await universalResolver.reverse(
        accounts[1].toLowerCase(),
        60,
      )
      expect(result['0']).to.equal('primaryname.eth')
      expect(result['1']).to.equal(publicResolver.address)
      expect(result['2']).to.equal(publicResolver.address)
    })
    it('should resolve a reverse record with a name for an old resolver (pre-multicoin)', async () => {
      const result = await universalResolver.reverse(
        accounts[10].toLowerCase(),
        60,
      )
      expect(result['0']).to.equal('oldprimary.eth')
      expect(result['1']).to.equal(dummyOldResolver.address)
      expect(result['2']).to.equal(dummyOldResolver.address)
    })
    // it('should not use all the gas on a revert', async () => {
    //   const estimate = await universalResolver.estimateGas.reverse(
    //     accounts[10].toLowerCase(),
    //     60,
    //     { gasLimit: 8000000 },
    //   )
    //   expect(estimate.lt(200000)).to.be.true
    // })
  })
})
