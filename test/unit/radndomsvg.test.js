const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const {
    networkConfig,
    developmentChains,
} = require("../../helper-hardhat-config")
const chainId = network.config.chainId

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Random SVG NFT unit test", () => {
          let randomSVG, vrfCoordinatorV2Mock, accounts, owner
          beforeEach(async () => {
              accounts = await ethers.getSigners()
              owner = accounts[0]
              await deployments.fixture(["all"])
              randomSVG = await ethers.getContract("RandomSVG", owner)
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock",
                  owner
              )
          })
          describe("constructor", () => {
              it("Initialized the mint fee correctly", async () => {
                  const currentMintFee = await randomSVG.getMintFee()
                  const expectedMintFee = networkConfig[chainId]["mintFee"]
                  assert.equal(
                      currentMintFee.toString(),
                      expectedMintFee.toString()
                  )
              })
          })
          describe("setMintFee", () => {
              it("update the mint fee", async () => {
                  const newMintFee = ethers.utils.parseEther("1")
                  await randomSVG.setMintFee(newMintFee)
                  const currentMintFee = await randomSVG.getMintFee()
                  assert.equal(newMintFee.toString(), currentMintFee.toString())
              })
          })
          describe("create", () => {
              it("should reverts if is not send enough ETH", async () => {
                  await expect(
                      randomSVG.create()
                  ).to.be.revertedWithCustomError(
                      randomSVG,
                      "RandomSVG__NeedToSendMoreETH"
                  )
              })
              it("should update the token ID", async () => {
                  const previousTokenId = await randomSVG.getTokenCounter()
                  const mintFee = networkConfig[chainId]["mintFee"]
                  await randomSVG.create({ value: mintFee })
                  const currentTokenId = await randomSVG.getTokenCounter()
                  assert(previousTokenId < previousTokenId.add(currentTokenId))
              })
              it("emits an event", async () => {
                  const mintFee = networkConfig[chainId]["mintFee"]
                  await expect(randomSVG.create({ value: mintFee })).to.emit(
                      randomSVG,
                      "RequestedRandomSVG"
                  )
              })
          })
          describe("fulfillRandomWords", () => {
              it("emits an event", async () => {
                  const txResponse = await randomSVG.create({
                      value: networkConfig[chainId]["mintFee"],
                  })
                  const txReceipt = await txResponse.wait(1)
                  const requestId = await txReceipt.events[1].args.requestId
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(
                          requestId,
                          randomSVG.address
                      )
                  ).to.emit(randomSVG, "CreatedUnfinishedRandomSVG")
              })
              describe("finishMint", () => {
                  it("should reverts if the tokenId is already set", async () => {
                      let requestId
                      const createTxResponse = await randomSVG.create({
                          value: networkConfig[chainId]["mintFee"],
                      })
                      const createTxReceipt = await createTxResponse.wait()
                      requestId = await createTxReceipt.events[1].args.requestId

                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          requestId,
                          randomSVG.address
                      )
                      const tokenId = await randomSVG.getTokenId(requestId)
                      const finishTx = await randomSVG.finishMint(tokenId)
                      await finishTx.wait()

                      await expect(
                          randomSVG.finishMint(tokenId)
                      ).to.be.revertedWithCustomError(
                          randomSVG,
                          "RandomSVG__TokenIsAlreadySet"
                      )
                  })

                  it("should reverts if there is not any random number", async () => {
                      let requestId
                      const createTxResponse = await randomSVG.create({
                          value: networkConfig[chainId]["mintFee"],
                      })
                      const createTxReceipt = await createTxResponse.wait()
                      requestId = await createTxReceipt.events[1].args.requestId
                      const tokenId = await randomSVG.getTokenId(requestId)
                      await expect(randomSVG.finishMint(tokenId)).to.be.reverted
                  })
                  it("Mint NFT and set token URI", async () => {
                      let requestId
                      const createTxResponse = await randomSVG.create({
                          value: networkConfig[chainId]["mintFee"],
                      })
                      const createTxReceipt = await createTxResponse.wait()
                      requestId = await createTxReceipt.events[1].args.requestId

                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          requestId,
                          randomSVG.address
                      )
                      const tokenId = randomSVG.getTokenId(requestId)
                      await expect(randomSVG.finishMint(tokenId)).to.emit(
                          randomSVG,
                          "CreatedRandomSVG"
                      )
                      const tokenUri = await randomSVG.tokenURI(0)
                      assert(tokenUri.includes("data:application/json;base64"))
                      console.log(tokenUri)
                  })
              })
              describe("withdraw", () => {
                  it("should reverts if is not the owner call", async () => {
                      const user = accounts[2]
                      await expect(randomSVG.connect(user).withdraw()).to.be
                          .reverted
                  })
                  it("call withdraw function and update the balance", async () => {
                      let requestId
                      const user = accounts[1]

                      const createTxResponse = await randomSVG
                          .connect(user)
                          .create({
                              value: networkConfig[chainId]["mintFee"],
                          })
                      const createTxReceipt = await createTxResponse.wait()
                      requestId = await createTxReceipt.events[1].args.requestId

                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          requestId,
                          randomSVG.address
                      )
                      const tokenId = randomSVG.getTokenId(requestId)
                      await expect(randomSVG.finishMint(tokenId)).to.emit(
                          randomSVG,
                          "CreatedRandomSVG"
                      )

                      const txResponse = await randomSVG.withdraw()
                      const txReceipt = await txResponse.wait()

                      const contractEndigBalance =
                          await randomSVG.provider.getBalance(randomSVG.address)
                      assert.equal(contractEndigBalance.toString(), "0")
                  })
              })
          })
      })
